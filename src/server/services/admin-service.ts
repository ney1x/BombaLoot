import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { withTransaction, type Db, type TxDb } from "../db/client";
import {
  AdminInvitePendingError,
  CannotSuspendAdminError,
  InvalidInviteTokenError,
  InvalidRoleTransitionError,
  InvalidSuspensionStateError,
  InviteEmailMismatchError,
  LastAdminError,
  SelfRoleChangeError,
  SelfSuspensionError,
  TargetUserNotFoundError,
} from "../auth/errors";
import { normalizeEmail } from "../auth/password";
import { revokeAllUserSessions } from "../auth/session";
import type { ValidatedSession } from "../auth/session";
import { createOpaqueToken, hashToken } from "../auth/tokens";
import { writeAudit } from "./audit";
import { adminInviteEmail, sendMail } from "./mailer";

/**
 * Gestión del rol SUPPORT. Solo ADMIN llega hasta acá — el filtro real es
 * `requireAdminApi()` en la ruta, esto es la segunda capa (defensa en
 * profundidad, no la única). El actor nunca puede tocar su propio rol por
 * este camino: un ADMIN comprometido o un bug en el front no puede
 * auto-degradarse ni, más grave, auto-promoverse fuera de este flujo.
 *
 * Las transiciones son explícitas y en un solo sentido por llamada:
 * `assignSupportRole` solo desde CUSTOMER, `removeSupportRole` solo desde
 * SUPPORT. Tocar un ADMIN (promover o degradar) no es una operación que
 * exista en fase 6A — evita que este endpoint se use por accidente para
 * quitarle ADMIN a alguien.
 */

export interface AdminActorContext {
  ip?: string | null;
  userAgent?: string | null;
}

interface TargetUserRow {
  id: string;
  role: "CUSTOMER" | "ADMIN" | "SUPPORT" | "SUPERADMIN";
  suspended_at: string | null;
}

async function loadTargetForUpdate(tx: TxDb, targetUserId: string): Promise<TargetUserRow> {
  const { rows } = (await tx.execute(sql`
    SELECT id, role, suspended_at FROM users WHERE id = ${targetUserId}::uuid FOR UPDATE
  `)) as unknown as { rows: TargetUserRow[] };

  const row = rows[0];
  if (!row) throw new TargetUserNotFoundError();
  return row;
}

export async function assignSupportRole(
  pool: Pool,
  actor: ValidatedSession,
  targetUserId: string,
  context: AdminActorContext = {},
): Promise<void> {
  if (actor.userId === targetUserId) throw new SelfRoleChangeError();

  await withTransaction(pool, async (tx) => {
    const target = await loadTargetForUpdate(tx, targetUserId);

    if (target.role !== "CUSTOMER") {
      throw new InvalidRoleTransitionError(
        target.role === "SUPPORT"
          ? "Este usuario ya tiene rol SUPPORT"
          : "No se puede asignar SUPPORT a una cuenta ADMIN",
      );
    }

    await tx.execute(sql`UPDATE users SET role = 'SUPPORT', updated_at = now() WHERE id = ${targetUserId}::uuid`);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "support.role_assigned",
      entityType: "user",
      entityId: targetUserId,
      metadata: { fromRole: target.role, toRole: "SUPPORT" },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

export async function removeSupportRole(
  pool: Pool,
  actor: ValidatedSession,
  targetUserId: string,
  context: AdminActorContext = {},
): Promise<void> {
  if (actor.userId === targetUserId) throw new SelfRoleChangeError();

  await withTransaction(pool, async (tx) => {
    const target = await loadTargetForUpdate(tx, targetUserId);

    if (target.role !== "SUPPORT") {
      throw new InvalidRoleTransitionError("Este usuario no tiene rol SUPPORT");
    }

    await tx.execute(sql`UPDATE users SET role = 'CUSTOMER', updated_at = now() WHERE id = ${targetUserId}::uuid`);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "support.role_removed",
      entityType: "user",
      entityId: targetUserId,
      metadata: { fromRole: "SUPPORT", toRole: "CUSTOMER" },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

/**
 * Suspende una cuenta: bloquea login (`loginUser` revisa `suspended_at`
 * después de validar la contraseña) y revoca toda sesión viva de una — un
 * usuario suspendido a mitad de sesión queda deslogueado en su próximo
 * request, no solo en su próximo login.
 *
 * ADMIN y SUPPORT pueden ambos suspender (matriz de permisos de soporte:
 * es exactamente el tipo de acción que SUPPORT necesita poder tomar sin
 * escalar a un ADMIN), pero ninguno de los dos puede suspender un ADMIN ni
 * su propia cuenta.
 */
export async function suspendUser(
  pool: Pool,
  actor: ValidatedSession,
  targetUserId: string,
  reason: string,
  context: AdminActorContext = {},
): Promise<void> {
  if (actor.userId === targetUserId) throw new SelfSuspensionError();

  await withTransaction(pool, async (tx) => {
    const target = await loadTargetForUpdate(tx, targetUserId);

    if (target.role === "ADMIN" || target.role === "SUPERADMIN") throw new CannotSuspendAdminError();
    if (target.suspended_at) throw new InvalidSuspensionStateError("Esta cuenta ya está suspendida");

    await tx.execute(sql`
      UPDATE users
         SET suspended_at = now(), suspended_reason = ${reason}, suspended_by = ${actor.userId}::uuid,
             updated_at = now()
       WHERE id = ${targetUserId}::uuid
    `);
    const revoked = await revokeAllUserSessions(tx, targetUserId);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "account.suspended",
      entityType: "user",
      entityId: targetUserId,
      metadata: { reason, sessionsRevoked: revoked },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

export async function unsuspendUser(
  pool: Pool,
  actor: ValidatedSession,
  targetUserId: string,
  context: AdminActorContext = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const target = await loadTargetForUpdate(tx, targetUserId);

    if (!target.suspended_at) throw new InvalidSuspensionStateError("Esta cuenta no está suspendida");

    await tx.execute(sql`
      UPDATE users
         SET suspended_at = NULL, suspended_reason = NULL, suspended_by = NULL, updated_at = now()
       WHERE id = ${targetUserId}::uuid
    `);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "account.unsuspended",
      entityType: "user",
      entityId: targetUserId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

/* ────────────────────────── invitaciones a ADMIN ────────────────────────── */

const ADMIN_INVITE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 días — decisión humana asíncrona, no un reset de contraseña.

export interface PendingAdminInvite {
  id: string;
  email: string;
  invitedByEmail: string | null;
  expiresAt: Date;
  createdAt: Date;
}

interface InviteQueryRow {
  id: string;
  email: string;
  invited_by_email: string | null;
  expires_at: string;
  created_at: string;
}

export async function listPendingAdminInvites(db: Db): Promise<PendingAdminInvite[]> {
  const { rows } = (await db.execute(sql`
    SELECT ai.id, ai.email, u.email AS invited_by_email, ai.expires_at, ai.created_at
      FROM admin_invites ai
      LEFT JOIN users u ON u.id = ai.invited_by
     WHERE ai.accepted_at IS NULL AND ai.revoked_at IS NULL AND ai.expires_at > now()
     ORDER BY ai.created_at DESC
  `)) as unknown as { rows: InviteQueryRow[] };

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    invitedByEmail: r.invited_by_email,
    expiresAt: new Date(r.expires_at),
    createdAt: new Date(r.created_at),
  }));
}

/**
 * Manda una invitación a ADMIN. No crea la cuenta acá — quien la reciba
 * inicia sesión (o se registra) con ese mismo email por su cuenta, y recién
 * ahí `acceptAdminInvite` promueve la cuenta ya existente. Evita duplicar
 * el flujo de alta (contraseña, Google, lo que sea) dentro de esto.
 */
export async function inviteAdmin(
  pool: Pool,
  actor: ValidatedSession,
  email: string,
  context: AdminActorContext = {},
): Promise<void> {
  const normalized = normalizeEmail(email);

  const token = await withTransaction(pool, async (tx) => {
    const { rows: existing } = (await tx.execute(
      sql`SELECT role FROM users WHERE lower(email) = ${normalized}`,
    )) as unknown as { rows: Array<{ role: string }> };
    if (existing[0]?.role === "ADMIN" || existing[0]?.role === "SUPERADMIN") {
      throw new InvalidRoleTransitionError("Ese email ya pertenece a una cuenta ADMIN o superior");
    }

    const { rows: pending } = (await tx.execute(sql`
      SELECT 1 FROM admin_invites WHERE lower(email) = ${normalized} AND accepted_at IS NULL AND revoked_at IS NULL
    `)) as unknown as { rows: unknown[] };
    if (pending.length > 0) throw new AdminInvitePendingError();

    const { value, hash } = createOpaqueToken();

    const { rows } = (await tx.execute(sql`
      INSERT INTO admin_invites (email, token_hash, invited_by, expires_at)
      VALUES (
        ${normalized}, ${hash}, ${actor.userId}::uuid,
        now() + make_interval(secs => ${ADMIN_INVITE_TTL_SECONDS}::double precision)
      )
      RETURNING id
    `)) as unknown as { rows: Array<{ id: string }> };

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "admin.invite_sent",
      entityType: "admin_invite",
      entityId: rows[0].id,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return value;
  });

  const acceptUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/invitacion-admin/${token}`;
  await sendMail({ to: normalized, subject: "Te invitaron a administrar BombaLoot", ...adminInviteEmail(acceptUrl) });
}

/**
 * Reenvía una invitación pendiente: mismo `admin_invites.id`, token nuevo
 * (el viejo queda inválido — nunca dos links vivos para la misma fila) y
 * vencimiento reiniciado a otros 7 días. A diferencia de `inviteAdmin`, esto
 * SÍ opera sobre una fila con invitación pendiente — es justamente el
 * camino para cuando el primer correo no llegó, sin pasar por el guard de
 * "ya hay una invitación pendiente" (que existe para no duplicar filas, no
 * para bloquear un reenvío legítimo de la misma).
 */
export async function resendAdminInvite(
  pool: Pool,
  actor: ValidatedSession,
  inviteId: string,
  context: AdminActorContext = {},
): Promise<void> {
  const { value, hash } = createOpaqueToken();

  const email = await withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(sql`
      UPDATE admin_invites
         SET token_hash = ${hash}, expires_at = now() + make_interval(secs => ${ADMIN_INVITE_TTL_SECONDS}::double precision)
       WHERE id = ${inviteId}::uuid AND accepted_at IS NULL AND revoked_at IS NULL
      RETURNING email
    `)) as unknown as { rows: Array<{ email: string }> };
    const row = rows[0];
    if (!row) throw new InvalidInviteTokenError();

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "admin.invite_resent",
      entityType: "admin_invite",
      entityId: inviteId,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return row.email;
  });

  const acceptUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/invitacion-admin/${value}`;
  await sendMail({ to: email, subject: "Te invitaron a administrar BombaLoot", ...adminInviteEmail(acceptUrl) });
}

export async function revokeAdminInvite(
  pool: Pool,
  actor: ValidatedSession,
  inviteId: string,
  context: AdminActorContext = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(sql`
      UPDATE admin_invites SET revoked_at = now()
       WHERE id = ${inviteId}::uuid AND accepted_at IS NULL AND revoked_at IS NULL
      RETURNING id
    `)) as unknown as { rows: Array<{ id: string }> };
    if (rows.length === 0) throw new InvalidInviteTokenError();

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "admin.invite_revoked",
      entityType: "admin_invite",
      entityId: inviteId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

/**
 * Acepta una invitación — requiere sesión ya iniciada (con cualquier rol) y
 * que el email de esa sesión coincida con el de la invitación. Promueve la
 * cuenta logueada a ADMIN; no crea ninguna cuenta nueva acá.
 */
export async function acceptAdminInvite(
  pool: Pool,
  actor: ValidatedSession,
  token: string,
  context: AdminActorContext = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(sql`
      SELECT id, email FROM admin_invites
       WHERE token_hash = ${hashToken(token)} AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
       FOR UPDATE
    `)) as unknown as { rows: Array<{ id: string; email: string }> };

    const invite = rows[0];
    if (!invite) throw new InvalidInviteTokenError();
    if (normalizeEmail(actor.email) !== invite.email) throw new InviteEmailMismatchError();

    const target = await loadTargetForUpdate(tx, actor.userId);
    if (target.role !== "ADMIN" && target.role !== "SUPERADMIN") {
      await tx.execute(sql`UPDATE users SET role = 'ADMIN', updated_at = now() WHERE id = ${actor.userId}::uuid`);
    }

    await tx.execute(sql`UPDATE admin_invites SET accepted_at = now() WHERE id = ${invite.id}::uuid`);

    await writeAudit(tx, {
      actorType: "ADMIN",
      actorId: actor.userId,
      action: "admin.invite_accepted",
      entityType: "user",
      entityId: actor.userId,
      metadata: { inviteId: invite.id },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

/**
 * Quita el rol ADMIN de un usuario (vuelve a CUSTOMER) y revoca todas sus
 * sesiones — mismo criterio que suspender: perder un privilegio no debería
 * dejar una sesión viva actuando con el rol que se le acaba de sacar.
 *
 * `FOR UPDATE` sobre TODAS las filas ADMIN (no solo la del target) bloquea
 * el conteo contra una carrera: dos `removeAdminRole` concurrentes con
 * exactamente 2 admins no pueden los dos pasar el chequeo y dejar el sitio
 * en cero — el segundo espera a que el primero termine la transacción.
 */
export async function removeAdminRole(
  pool: Pool,
  actor: ValidatedSession,
  targetUserId: string,
  context: AdminActorContext = {},
): Promise<void> {
  if (actor.userId === targetUserId) throw new SelfRoleChangeError();

  await withTransaction(pool, async (tx) => {
    const target = await loadTargetForUpdate(tx, targetUserId);
    if (target.role !== "ADMIN") throw new InvalidRoleTransitionError("Este usuario no tiene rol ADMIN");

    // Cuenta ADMIN + SUPERADMIN juntos: un SUPERADMIN ya cubre todo lo que
    // hace un ADMIN, así que sacar al último ADMIN "normal" mientras sigue
    // habiendo un SUPERADMIN es válido — lo que nunca puede pasar es quedar
    // sin NADIE en ninguno de los dos niveles.
    const { rows: admins } = (await tx.execute(
      sql`SELECT id FROM users WHERE role IN ('ADMIN', 'SUPERADMIN') FOR UPDATE`,
    )) as unknown as { rows: Array<{ id: string }> };
    if (admins.length <= 1) throw new LastAdminError();

    await tx.execute(sql`UPDATE users SET role = 'CUSTOMER', updated_at = now() WHERE id = ${targetUserId}::uuid`);
    const revoked = await revokeAllUserSessions(tx, targetUserId);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "admin.role_removed",
      entityType: "user",
      entityId: targetUserId,
      metadata: { sessionsRevoked: revoked },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

/**
 * Vuelve a poner ADMIN a alguien que YA lo fue antes y se lo sacaron — sin
 * pasar por invitación de nuevo. La condición real no es "confiar de
 * palabra": exige encontrar un `admin.role_removed` previo para este mismo
 * usuario en el log de auditoría (mismo criterio que ya usa
 * `listUsersAdmin` para decidir si mostrar el botón). Si nunca fue ADMIN,
 * el camino sigue siendo `inviteAdmin` — este atajo no reemplaza esa
 * verificación por email para una cuenta que nunca pasó por ella.
 */
export async function restoreAdminRole(
  pool: Pool,
  actor: ValidatedSession,
  targetUserId: string,
  context: AdminActorContext = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const target = await loadTargetForUpdate(tx, targetUserId);
    if (target.role === "ADMIN" || target.role === "SUPERADMIN") {
      throw new InvalidRoleTransitionError("Este usuario ya tiene rol ADMIN o superior");
    }

    const { rows: history } = (await tx.execute(sql`
      SELECT 1 FROM audit_logs
       WHERE entity_type = 'user' AND entity_id = ${targetUserId} AND action = 'admin.role_removed'
       LIMIT 1
    `)) as unknown as { rows: unknown[] };
    if (history.length === 0) {
      throw new InvalidRoleTransitionError(
        "Este usuario nunca fue ADMIN — mandale una invitación en vez de restaurarlo",
      );
    }

    await tx.execute(sql`UPDATE users SET role = 'ADMIN', updated_at = now() WHERE id = ${targetUserId}::uuid`);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "admin.role_restored",
      entityType: "user",
      entityId: targetUserId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

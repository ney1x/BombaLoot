import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { withTransaction, type TxDb } from "../db/client";
import { InvalidRoleTransitionError, SelfRoleChangeError, TargetUserNotFoundError } from "../auth/errors";
import type { ValidatedSession } from "../auth/session";
import { writeAudit } from "./audit";

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
  role: "CUSTOMER" | "ADMIN" | "SUPPORT";
}

async function loadTargetForUpdate(tx: TxDb, targetUserId: string): Promise<TargetUserRow> {
  const { rows } = (await tx.execute(sql`
    SELECT id, role FROM users WHERE id = ${targetUserId}::uuid FOR UPDATE
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
      actorType: "ADMIN",
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
      actorType: "ADMIN",
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

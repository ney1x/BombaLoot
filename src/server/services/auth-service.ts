import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { createDb, withTransaction } from "../db/client";
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidCurrentPasswordError,
  InvalidOrderTokenError,
  InvalidResetTokenError,
  OrderAlreadyClaimedError,
} from "../auth/errors";
import { hashPassword, normalizeEmail, verifyPasswordHash } from "../auth/password";
import {
  createSession,
  revokeAllUserSessions,
  revokeSession,
  type CreatedSession,
  type SessionContext,
} from "../auth/session";
import { createOpaqueToken, hashToken } from "../auth/tokens";
import { AUTH_LIMITS } from "./auth-limits";
import { passwordResetEmail, sendMail } from "./mailer";
import { checkRateLimit } from "./rate-limit";
import { writeAudit } from "./audit";

/**
 * Servicio de autenticación. Cada flujo público de acá abajo es la
 * composición completa (validar → escribir → auditar) — los Route Handlers
 * de `app/api/auth/*` son deliberadamente delgados: parsean el body con
 * Zod, sacan IP/user-agent del request, y llaman a una función de acá.
 * Ninguna regla de negocio vive en la ruta HTTP.
 */

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

function sessionContext(meta: RequestMeta): SessionContext {
  return { ip: meta.ip ?? null, userAgent: meta.userAgent ?? null };
}

export interface AuthUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  purchasesCount: number;
}

export interface AuthResult {
  user: AuthUser;
  session: CreatedSession;
}

/* ────────────────────────── registro ────────────────────────── */

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export async function registerUser(
  pool: Pool,
  input: RegisterInput,
  meta: RequestMeta,
  rateLimitKey?: string,
): Promise<AuthResult> {
  if (rateLimitKey) {
    checkRateLimit(
      `auth:register:${rateLimitKey}`,
      AUTH_LIMITS.registerMaxPerWindow,
      AUTH_LIMITS.registerWindowSeconds,
    );
  }

  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  // Argon2 es intencionalmente costoso; se calcula ANTES de abrir la
  // transacción para no tener una conexión de pool ocupada y sin hacer
  // nada mientras corre el hash.
  const passwordHash = await hashPassword(input.password);

  return withTransaction(pool, async (tx) => {
    const { rows: existing } = (await tx.execute(
      sql`SELECT 1 FROM users WHERE lower(email) = ${email}`,
    )) as unknown as { rows: unknown[] };
    if (existing.length > 0) {
      throw new EmailAlreadyRegisteredError();
    }

    let userId: string;
    try {
      const { rows } = (await tx.execute(sql`
        INSERT INTO users (email, name, password_hash)
        VALUES (${email}, ${name}, ${passwordHash})
        RETURNING id
      `)) as unknown as { rows: Array<{ id: string }> };
      userId = rows[0].id;
    } catch (error) {
      // Carrera: dos registros con el mismo email llegaron a la vez y
      // pasaron el SELECT de arriba antes de que ninguno insertara. El
      // índice único (`users_email_lower_key`) es la garantía real; esto
      // solo traduce su violación a un error de dominio en vez de un 500
      // con el texto crudo de Postgres.
      if ((error as { code?: string }).code === "23505") {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    }

    const session = await createSession(tx, userId, sessionContext(meta));

    await writeAudit(tx, {
      actorType: "CUSTOMER",
      actorId: userId,
      action: "auth.registered",
      entityType: "user",
      entityId: userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      user: { id: userId, name, email, role: "CUSTOMER", purchasesCount: 0 },
      session,
    };
  });
}

/* ────────────────────────── login ────────────────────────── */

/**
 * Hash de referencia para cuando el email no existe. Se calcula una sola
 * vez (cacheado) y se reusa para que `loginUser` corra siempre un `verify()`
 * de Argon2, exista o no la cuenta — así el tiempo de respuesta no delata
 * por sí solo si un email está registrado por la simple ausencia del cómputo.
 * No es timing-safety perfecta (la red y el resto del handler tienen su
 * propia variancia), pero cierra la señal más barata de explotar.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("no-existe-ninguna-cuenta-con-este-email");
  return dummyHashPromise;
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function loginUser(
  pool: Pool,
  input: LoginInput,
  meta: RequestMeta,
  rateLimitKey?: string,
): Promise<AuthResult> {
  if (rateLimitKey) {
    checkRateLimit(
      `auth:login:${rateLimitKey}`,
      AUTH_LIMITS.loginMaxPerWindow,
      AUTH_LIMITS.loginWindowSeconds,
    );
  }

  const email = normalizeEmail(input.email);
  const db = createDb(pool);

  const { rows } = (await db.execute(
    sql`SELECT id, name, email, role, purchases_count, password_hash
          FROM users WHERE lower(email) = ${email}`,
  )) as unknown as {
    rows: Array<{
      id: string;
      name: string | null;
      email: string;
      role: string;
      purchases_count: number;
      password_hash: string;
    }>;
  };

  const row = rows[0];
  const hashToCheck = row?.password_hash ?? (await getDummyHash());
  const passwordOk = await verifyPasswordHash(hashToCheck, input.password);

  if (!row || !passwordOk) {
    await writeAudit(db, {
      actorType: "CUSTOMER",
      actorId: row?.id,
      action: "auth.login_failed",
      entityType: "user",
      // Sin fila, no hay id de usuario que auditar sin filtrar el email en
      // el propio log — se usa un marcador fijo en vez del email en claro.
      entityId: row?.id ?? "unknown",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    // Mismo error, mismo mensaje, tanto si el email no existe como si la
    // contraseña es incorrecta — el llamador no puede distinguir los casos.
    throw new InvalidCredentialsError();
  }

  return withTransaction(pool, async (tx) => {
    // Sesión SIEMPRE nueva, nunca se reutiliza una existente: es lo que
    // evita session fixation (un token capturado antes del login no se
    // vuelve válido por loguearse encima).
    const session = await createSession(tx, row.id, sessionContext(meta));

    await writeAudit(tx, {
      actorType: "CUSTOMER",
      actorId: row.id,
      action: "auth.login",
      entityType: "user",
      entityId: row.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        purchasesCount: row.purchases_count,
      },
      session,
    };
  });
}

/* ────────────────────────── logout ────────────────────────── */

export async function logoutUser(pool: Pool, sessionId: string, userId: string): Promise<void> {
  const db = createDb(pool);
  await revokeSession(db, sessionId);
  await writeAudit(db, {
    actorType: "CUSTOMER",
    actorId: userId,
    action: "auth.logout",
    entityType: "session",
    entityId: sessionId,
  });
}

/* ────────────────────────── recuperación de contraseña ────────────────────────── */

const PASSWORD_RESET_TTL_SECONDS = 60 * 30; // 30 min

/**
 * Siempre resuelve, exista o no el email — el llamador (el Route Handler)
 * siempre responde el mismo mensaje genérico. La diferencia de trabajo real
 * entre "existe" y "no existe" queda relativamente chica: en el caso
 * negativo se corre igual una consulta (el `SELECT 1` de abajo) para no
 * dejar una diferencia de "una consulta menos" tan obvia como la ausencia
 * total de trabajo de base de datos.
 */
export async function requestPasswordReset(
  pool: Pool,
  email: string,
  rateLimitKey?: string,
): Promise<void> {
  if (rateLimitKey) {
    checkRateLimit(
      `auth:reset-request:${rateLimitKey}`,
      AUTH_LIMITS.resetRequestMaxPerWindow,
      AUTH_LIMITS.resetRequestWindowSeconds,
    );
  }

  const normalized = normalizeEmail(email);
  const db = createDb(pool);

  const { rows } = (await db.execute(
    sql`SELECT id FROM users WHERE lower(email) = ${normalized}`,
  )) as unknown as { rows: Array<{ id: string }> };

  const user = rows[0];
  if (!user) {
    return;
  }

  const { value: token, hash } = createOpaqueToken();

  await db.execute(sql`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (
      ${user.id}::uuid,
      ${hash},
      now() + make_interval(secs => ${PASSWORD_RESET_TTL_SECONDS}::double precision)
    )
  `);

  await writeAudit(db, {
    actorType: "CUSTOMER",
    actorId: user.id,
    action: "auth.password_reset_requested",
    entityType: "user",
    entityId: user.id,
  });

  const resetUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/cuenta/recuperar/${token}`;
  await sendMail({
    to: normalized,
    subject: "Recuperá tu contraseña de Loadout",
    text: passwordResetEmail(resetUrl),
  });
}

/**
 * Consume un token de recuperación: cambia la contraseña, invalida TODAS
 * las sesiones existentes (requisito explícito), y desde ahí abre una
 * sesión nueva para no obligar a un segundo login inmediato.
 *
 * El `UPDATE ... WHERE used_at IS NULL AND expires_at > now() RETURNING`
 * es la misma forma que el reclamo de códigos y los cupones: la condición de
 * un solo uso se aplica en la propia escritura, no en un SELECT previo — dos
 * requests con el mismo token en simultáneo no pueden consumirlo los dos.
 */
export async function resetPassword(
  pool: Pool,
  token: string,
  newPassword: string,
  meta: RequestMeta,
): Promise<AuthResult> {
  const passwordHash = await hashPassword(newPassword);

  return withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(sql`
      UPDATE password_reset_tokens
         SET used_at = now()
       WHERE token_hash = ${hashToken(token)}
         AND used_at IS NULL
         AND expires_at > now()
      RETURNING user_id
    `)) as unknown as { rows: Array<{ user_id: string }> };

    const claimed = rows[0];
    if (!claimed) {
      throw new InvalidResetTokenError();
    }

    await tx.execute(
      sql`UPDATE users SET password_hash = ${passwordHash}, updated_at = now() WHERE id = ${claimed.user_id}::uuid`,
    );

    await revokeAllUserSessions(tx, claimed.user_id);

    await writeAudit(tx, {
      actorType: "CUSTOMER",
      actorId: claimed.user_id,
      action: "auth.password_reset",
      entityType: "user",
      entityId: claimed.user_id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const session = await createSession(tx, claimed.user_id, sessionContext(meta));

    const { rows: userRows } = (await tx.execute(
      sql`SELECT id, name, email, role, purchases_count FROM users WHERE id = ${claimed.user_id}::uuid`,
    )) as unknown as {
      rows: Array<{ id: string; name: string | null; email: string; role: string; purchases_count: number }>;
    };
    const u = userRows[0];

    return {
      user: { id: u.id, name: u.name, email: u.email, role: u.role, purchasesCount: u.purchases_count },
      session,
    };
  });
}

/* ────────────────────────── cambio de contraseña (logueado) ────────────────────────── */

export async function changePassword(
  pool: Pool,
  userId: string,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const db = createDb(pool);

  const { rows } = (await db.execute(
    sql`SELECT password_hash FROM users WHERE id = ${userId}::uuid`,
  )) as unknown as { rows: Array<{ password_hash: string }> };

  const row = rows[0];
  if (!row || !(await verifyPasswordHash(row.password_hash, currentPassword))) {
    throw new InvalidCurrentPasswordError();
  }

  const newHash = await hashPassword(newPassword);

  await withTransaction(pool, async (tx) => {
    await tx.execute(
      sql`UPDATE users SET password_hash = ${newHash}, updated_at = now() WHERE id = ${userId}::uuid`,
    );
    // Se preserva la sesión actual: cambiar la contraseña desde el perfil no
    // debería desloguear a quien la está cambiando en el mismo momento.
    await revokeAllUserSessions(tx, userId, currentSessionId);
    await writeAudit(tx, {
      actorType: "CUSTOMER",
      actorId: userId,
      action: "auth.password_changed",
      entityType: "user",
      entityId: userId,
    });
  });
}

/* ────────────────────────── vincular pedido de invitado ────────────────────────── */

/**
 * Asocia un pedido de invitado a una cuenta usando el mismo token opaco que
 * ya da acceso a `/pedido/[token]` — poseer el token es la prueba de
 * propiedad, la misma que ya se confía para mostrar el código. No hay
 * verificación de email de por medio: es exactamente el "mecanismo de
 * ownership" ya definido para invitados, reutilizado acá.
 */
export async function claimGuestOrder(
  pool: Pool,
  userId: string,
  accessToken: string,
): Promise<{ orderId: string; alreadyClaimedByThisUser: boolean }> {
  return withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(sql`
      SELECT id, user_id FROM orders
       WHERE access_token_hash = ${hashToken(accessToken)}
         AND access_token_revoked_at IS NULL
    `)) as unknown as { rows: Array<{ id: string; user_id: string | null }> };

    const order = rows[0];
    if (!order) {
      throw new InvalidOrderTokenError();
    }

    if (order.user_id === userId) {
      return { orderId: order.id, alreadyClaimedByThisUser: true };
    }

    const { rows: updated } = (await tx.execute(sql`
      UPDATE orders SET user_id = ${userId}::uuid, updated_at = now()
       WHERE id = ${order.id}::uuid AND user_id IS NULL
      RETURNING id
    `)) as unknown as { rows: Array<{ id: string }> };

    if (updated.length === 0) {
      // Ya tenía user_id y no era el nuestro — se coló otra cuenta antes.
      throw new OrderAlreadyClaimedError();
    }

    await writeAudit(tx, {
      actorType: "CUSTOMER",
      actorId: userId,
      action: "auth.order_claimed",
      entityType: "order",
      entityId: order.id,
    });

    return { orderId: order.id, alreadyClaimedByThisUser: false };
  });
}

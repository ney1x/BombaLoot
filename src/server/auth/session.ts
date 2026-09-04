import "server-only";

import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { sanitizeIpForStorage } from "../http/request-meta";
import { createOpaqueToken, hashToken } from "./tokens";

/**
 * Sesiones de servidor: token opaco + tabla `sessions`. El servidor es la
 * única fuente de verdad — nada de JWT autocontenido que el cliente pueda
 * decodificar o que sobreviva a una revocación. El valor del token nunca se
 * guarda: solo su sha256 (`hashToken`, el mismo helper que usan
 * `orders.access_token_hash` y `password_reset_tokens.token_hash`), así que
 * la comparación siempre se resuelve en la base como igualdad exacta de
 * hash — nunca hay un `===` en Node sobre el token crudo.
 */

/** Duración de una sesión "recordada". 30 días. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Techo de vida para una sesión SIN "recordarme". La fila en `sessions`
 * expira a las 12h igual (nunca queda una sesión viva para siempre en la
 * base); la cookie que la porta además se emite sin `maxAge` para que el
 * navegador la descarte al cerrarse — ver `cookies.ts`.
 */
export const SESSION_TTL_SECONDS_SHORT = 60 * 60 * 12;

export interface SessionContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface CreatedSession {
  sessionId: string;
  token: string;
  expiresAt: Date;
}

/**
 * Crea una sesión nueva. Se llama SIEMPRE con un token nuevo — nunca se
 * reutiliza uno existente, ni siquiera al re-loguearse con la misma cuenta.
 * Eso es lo que evita session fixation: un token capturado antes del login
 * (por ejemplo de una sesión anónima previa) no se vuelve válido después,
 * porque después del login circula un token distinto.
 */
export async function createSession(
  db: Db,
  userId: string,
  context: SessionContext = {},
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<CreatedSession> {
  const { value: token, hash } = createOpaqueToken();

  const { rows } = (await db.execute(sql`
    INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent)
    VALUES (
      ${userId}::uuid,
      ${hash},
      now() + make_interval(secs => ${ttlSeconds}::double precision),
      ${sanitizeIpForStorage(context.ip)}::inet,
      ${context.userAgent ?? null}
    )
    RETURNING id, expires_at
  `)) as unknown as { rows: Array<{ id: string; expires_at: string }> };

  return {
    sessionId: rows[0].id,
    token,
    expiresAt: new Date(rows[0].expires_at),
  };
}

export interface ValidatedSession {
  sessionId: string;
  userId: string;
  email: string;
  name: string | null;
  role: "CUSTOMER" | "ADMIN" | "SUPPORT" | "SUPERADMIN";
  purchasesCount: number;
  expiresAt: Date;
}

/** Valida un token de sesión y devuelve la sesión + el usuario, o `null`. */
export async function validateSessionToken(
  db: Db,
  token: string,
): Promise<ValidatedSession | null> {
  if (!token) return null;

  const { rows } = (await db.execute(sql`
    SELECT s.id AS session_id, s.expires_at,
           u.id AS user_id, u.email, u.name, u.role, u.purchases_count, u.suspended_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ${hashToken(token)}
       AND s.expires_at > now()
  `)) as unknown as {
    rows: Array<{
      session_id: string;
      expires_at: string;
      user_id: string;
      email: string;
      name: string | null;
      role: "CUSTOMER" | "ADMIN" | "SUPPORT" | "SUPERADMIN";
      purchases_count: number;
      suspended_at: string | null;
    }>;
  };

  const row = rows[0];
  if (!row) return null;
  // Red de seguridad: suspender ya revoca todas las sesiones del usuario
  // (`suspendUser`, en la misma transacción), así que esta rama es
  // prácticamente inalcanzable en uso normal — pero si alguna vez una
  // sesión sobrevive a una suspensión (fila tocada a mano, bug futuro), acá
  // se corta igual, tratándola como sesión inválida.
  if (row.suspended_at) return null;

  return {
    sessionId: row.session_id,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    purchasesCount: row.purchases_count,
    expiresAt: new Date(row.expires_at),
  };
}

export async function touchSession(db: Db, sessionId: string): Promise<void> {
  await db.execute(sql`UPDATE sessions SET last_seen_at = now() WHERE id = ${sessionId}::uuid`);
}

export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db.execute(sql`DELETE FROM sessions WHERE id = ${sessionId}::uuid`);
}

export async function revokeSessionByToken(db: Db, token: string): Promise<void> {
  await db.execute(sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`);
}

/**
 * Revoca todas las sesiones de un usuario. Se usa al resetear contraseña
 * (requisito explícito: "invalidar sesiones anteriores") y queda disponible
 * para un futuro "cerrar sesión en todos los dispositivos" desde el perfil.
 *
 * `exceptSessionId` es para cambiar la contraseña estando logueado sin
 * cerrar la sesión propia. El reset por token (usuario deslogueado) siempre
 * revoca todo — no hay sesión "actual" que preservar.
 */
export async function revokeAllUserSessions(
  db: Db,
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const filter = exceptSessionId ? sql`AND id <> ${exceptSessionId}::uuid` : sql``;
  const result = (await db.execute(
    sql`DELETE FROM sessions WHERE user_id = ${userId}::uuid ${filter}`,
  )) as unknown as { rowCount: number | null };
  return result.rowCount ?? 0;
}

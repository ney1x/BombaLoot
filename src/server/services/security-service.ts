import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { createDb, type Db } from "../db/client";
import type { ValidatedSession } from "../auth/session";
import { IpBlockedError, IpBlockNotFoundError } from "./errors";
import { writeAudit } from "./audit";

/**
 * Bloqueo por IP. Complementa (no reemplaza) `rate-limit.ts`: el rate
 * limiter frena abuso automático de una IP normal; esto es la lista negra
 * explícita que un admin arma a mano después de investigar un caso puntual
 * (soporte, fraude, un ticket abusivo) — no vence solo, hay que sacarla.
 */

export interface BlockedIpRow {
  ip: string;
  reason: string;
  blockedBy: string | null;
  blockedByEmail: string | null;
  createdAt: Date;
}

interface BlockedIpQueryRow {
  ip: string;
  reason: string;
  blocked_by: string | null;
  blocked_by_email: string | null;
  created_at: string;
}

/**
 * Corta el flujo si `ip` está bloqueada. Se llama desde los puntos de
 * entrada públicos que más importa frenar (registro, login, checkout,
 * creación de tickets) — no desde cada request, para no convertir cada
 * página en una consulta extra a la base.
 *
 * `ip` "unknown" (sin proxy header, típico en local) nunca bloquea nada:
 * bloquear ese valor bloquearía a todo el mundo sin proxy delante.
 */
export async function assertIpNotBlocked(
  pool: Pool,
  ip: string | null | undefined,
  context: { userAgent?: string | null; action?: string } = {},
): Promise<void> {
  if (!ip || ip === "unknown") return;

  const db = createDb(pool);
  const { rows } = (await db.execute(sql`SELECT reason FROM ip_blocks WHERE ip = ${ip}`)) as unknown as {
    rows: { reason: string }[];
  };
  if (!rows[0]) return;

  await writeAudit(db, {
    actorType: "SYSTEM",
    action: "security.blocked_ip_attempt",
    entityType: "ip",
    entityId: ip,
    metadata: context.action ? { attemptedAction: context.action } : undefined,
    ip,
    userAgent: context.userAgent,
  });
  throw new IpBlockedError();
}

export async function blockIp(
  pool: Pool,
  actor: ValidatedSession,
  ip: string,
  reason: string,
  context: { userAgent?: string | null } = {},
): Promise<void> {
  const db = createDb(pool);
  await db.execute(sql`
    INSERT INTO ip_blocks (ip, reason, blocked_by)
    VALUES (${ip}, ${reason}, ${actor.userId}::uuid)
    ON CONFLICT (ip) DO UPDATE SET reason = ${reason}, blocked_by = ${actor.userId}::uuid, created_at = now()
  `);

  await writeAudit(db, {
    actorType: actor.role === "ADMIN" ? "ADMIN" : "SUPPORT",
    actorId: actor.userId,
    action: "security.ip_blocked",
    entityType: "ip",
    entityId: ip,
    metadata: { reason },
    userAgent: context.userAgent,
  });
}

export async function unblockIp(
  pool: Pool,
  actor: ValidatedSession,
  ip: string,
  context: { userAgent?: string | null } = {},
): Promise<void> {
  const db = createDb(pool);
  const result = (await db.execute(sql`DELETE FROM ip_blocks WHERE ip = ${ip}`)) as unknown as {
    rowCount: number | null;
  };
  if (!result.rowCount) throw new IpBlockNotFoundError(ip);

  await writeAudit(db, {
    actorType: actor.role === "ADMIN" ? "ADMIN" : "SUPPORT",
    actorId: actor.userId,
    action: "security.ip_unblocked",
    entityType: "ip",
    entityId: ip,
    userAgent: context.userAgent,
  });
}

export async function listBlockedIps(db: Db): Promise<BlockedIpRow[]> {
  const { rows } = (await db.execute(sql`
    SELECT b.ip, b.reason, b.blocked_by, u.email AS blocked_by_email, b.created_at
      FROM ip_blocks b
      LEFT JOIN users u ON u.id = b.blocked_by
     ORDER BY b.created_at DESC
  `)) as unknown as { rows: BlockedIpQueryRow[] };

  return rows.map((r) => ({
    ip: r.ip,
    reason: r.reason,
    blockedBy: r.blocked_by,
    blockedByEmail: r.blocked_by_email,
    createdAt: new Date(r.created_at),
  }));
}

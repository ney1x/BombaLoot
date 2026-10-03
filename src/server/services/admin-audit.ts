import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";

/**
 * Lector de `audit_logs` para el panel admin — solo lectura, ninguna
 * escritura vive acá (eso lo hace `writeAudit` desde cada servicio que
 * audita una acción). `metadata` ya viene garantizada sin secretos por
 * `writeAudit` (ver `assertNoSecrets` en `audit.ts`), así que no hay nada
 * que enmascarar acá tampoco.
 */

export const auditFiltersSchema = z.object({
  entityType: z.string().trim().max(64).optional(),
  entityId: z.string().trim().max(200).optional(),
  action: z.string().trim().max(64).optional(),
  actorId: z.string().uuid().optional(),
  /** Filtro de rango, "YYYY-MM-DD" desde inputs `type="date"` del form. */
  from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Cursor de paginación: solo eventos anteriores a este timestamp (keyset, no OFFSET). */
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type AuditFilters = z.infer<typeof auditFiltersSchema>;

export interface AdminAuditRow {
  id: number;
  occurredAt: Date;
  actorType: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
}

interface AuditQueryRow {
  id: number;
  occurred_at: string;
  actor_type: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
}

export async function listAuditLogsAdmin(db: Db, filters: AuditFilters): Promise<AdminAuditRow[]> {
  const conditions = [sql`1=1`];
  /* ILIKE case-insensitive + substring en type/action — antes era `=` exacto y
     sensible a mayúsculas, así que "product" vs "Product" o "updated" (sin el
     prefijo "product.") devolvían 0 filas indistinguible de "no pasó nada". */
  if (filters.entityType) conditions.push(sql`al.entity_type ILIKE ${"%" + filters.entityType + "%"}`);
  if (filters.entityId) conditions.push(sql`al.entity_id ILIKE ${filters.entityId}`);
  if (filters.action) conditions.push(sql`al.action ILIKE ${"%" + filters.action + "%"}`);
  if (filters.actorId) conditions.push(sql`al.actor_id = ${filters.actorId}::uuid`);
  if (filters.from) conditions.push(sql`al.occurred_at >= ${filters.from}::date`);
  if (filters.to) conditions.push(sql`al.occurred_at < (${filters.to}::date + interval '1 day')`);
  if (filters.before) conditions.push(sql`al.occurred_at < ${filters.before}::timestamptz`);
  const where = conditions.reduce((acc, c) => sql`${acc} AND ${c}`);

  const { rows } = (await db.execute(sql`
    SELECT al.id, al.occurred_at, al.actor_type, al.actor_id, u.email AS actor_email,
           al.action, al.entity_type, al.entity_id, al.metadata
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.actor_id
     WHERE ${where}
     ORDER BY al.occurred_at DESC
     LIMIT ${filters.limit}
  `)) as unknown as { rows: AuditQueryRow[] };

  return rows.map((r) => ({
    id: Number(r.id),
    occurredAt: new Date(r.occurred_at),
    actorType: r.actor_type,
    actorId: r.actor_id,
    actorEmail: r.actor_email,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    metadata: r.metadata,
  }));
}

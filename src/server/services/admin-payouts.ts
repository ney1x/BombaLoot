import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { createDb, type Db } from "../db/client";
import type { ValidatedSession } from "../auth/session";
import { TargetUserNotFoundError } from "../auth/errors";
import { writeAudit } from "./audit";

/**
 * Liquidaciones a admins: lo que ya se le transfirió a cada uno por sus
 * códigos vendidos. El "le debo" sale de cruzar esto con el neto de
 * `getAdminEarnings` — acá no se recalcula ninguna ganancia.
 *
 * Carga manual hoy (la transferencia se hace por fuera). Cuando haya API de
 * dispersión, el webhook de pago aprobado puede llamar a `recordAdminPayout`
 * con `method` del proveedor y `reference` = id de la dispersión.
 */

export const PAYOUT_METHODS = ["nequi", "bancolombia", "efectivo", "otro"] as const;

export interface AdminPayout {
  id: string;
  adminId: string;
  adminLabel: string;
  amountCop: number;
  method: string;
  reference: string | null;
  note: string | null;
  createdByLabel: string | null;
  createdAt: Date;
}

interface PayoutRow {
  id: string;
  admin_id: string;
  admin_label: string;
  amount_cop: string;
  method: string;
  reference: string | null;
  note: string | null;
  created_by_label: string | null;
  created_at: string;
}

/** Total pagado por admin (incluye ajustes negativos). */
export async function getPaidByAdmin(db: Db): Promise<Map<string, number>> {
  const { rows } = (await db.execute(sql`
    SELECT admin_id, SUM(amount_cop) AS paid_cop FROM admin_payouts GROUP BY admin_id
  `)) as unknown as { rows: { admin_id: string; paid_cop: string }[] };
  return new Map(rows.map((r) => [r.admin_id, Number(r.paid_cop)]));
}

export async function listRecentPayouts(db: Db, limit = 20): Promise<AdminPayout[]> {
  const { rows } = (await db.execute(sql`
    SELECT p.id, p.admin_id, COALESCE(a.name, a.email) AS admin_label, p.amount_cop, p.method,
           p.reference, p.note, COALESCE(c.name, c.email) AS created_by_label, p.created_at
      FROM admin_payouts p
      JOIN users a ON a.id = p.admin_id
      LEFT JOIN users c ON c.id = p.created_by
     ORDER BY p.created_at DESC
     LIMIT ${limit}
  `)) as unknown as { rows: PayoutRow[] };
  return rows.map((r) => ({
    id: r.id,
    adminId: r.admin_id,
    adminLabel: r.admin_label,
    amountCop: Number(r.amount_cop),
    method: r.method,
    reference: r.reference,
    note: r.note,
    createdByLabel: r.created_by_label,
    createdAt: new Date(r.created_at),
  }));
}

export const recordAdminPayoutSchema = z.object({
  adminId: z.string().uuid("adminId debe ser un UUID"),
  amountCop: z
    .number()
    .int()
    .refine((n) => n !== 0, "El monto no puede ser 0"),
  method: z.enum(PAYOUT_METHODS),
  reference: z.string().trim().max(200).optional().transform((v) => v || null),
  note: z.string().trim().max(500).optional().transform((v) => v || null),
});

export async function recordAdminPayout(
  pool: Pool,
  actor: ValidatedSession,
  input: z.infer<typeof recordAdminPayoutSchema>,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ id: string }> {
  const db = createDb(pool);

  const { rows } = (await db.execute(sql`
    INSERT INTO admin_payouts (admin_id, amount_cop, method, reference, note, created_by)
    SELECT u.id, ${input.amountCop}, ${input.method}, ${input.reference}, ${input.note}, ${actor.userId}::uuid
      FROM users u
     WHERE u.id = ${input.adminId}::uuid AND u.role IN ('ADMIN', 'SUPERADMIN')
    RETURNING id
  `)) as unknown as { rows: { id: string }[] };
  if (rows.length === 0) throw new TargetUserNotFoundError();

  await writeAudit(db, {
    actorType: actor.role,
    actorId: actor.userId,
    action: "admin_payout.recorded",
    entityType: "admin_payout",
    entityId: rows[0].id,
    metadata: { ...input },
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return rows[0];
}

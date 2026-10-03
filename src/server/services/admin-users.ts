import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";

/**
 * Lectura de usuarios para el admin. La gestión de rol SUPPORT
 * (`assignSupportRole`/`removeSupportRole`) ya vive en `admin-service.ts`
 * desde la fase 6A — acá solo hay consultas, sin mutación.
 */

export const userFiltersSchema = z.object({
  email: z.string().trim().max(320).optional(),
  role: z.enum(["CUSTOMER", "ADMIN", "SUPPORT", "SUPERADMIN"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type UserFilters = z.infer<typeof userFiltersSchema>;

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: "CUSTOMER" | "ADMIN" | "SUPPORT" | "SUPERADMIN";
  purchasesCount: number;
  createdAt: Date;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  /** Tuvo rol ADMIN antes y se lo sacaron (`admin.role_removed` en el log de auditoría) — habilita "Volver a hacer ADMIN" sin pasar por invitación. */
  wasAdmin: boolean;
}

interface UserQueryRow {
  id: string;
  email: string;
  name: string | null;
  role: "CUSTOMER" | "ADMIN" | "SUPPORT" | "SUPERADMIN";
  purchases_count: number;
  created_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  was_admin: boolean;
}

export async function listUsersAdmin(db: Db, filters: UserFilters): Promise<AdminUserRow[]> {
  const conditions = [sql`1=1`];
  if (filters.email) conditions.push(sql`lower(email) LIKE ${"%" + filters.email.toLowerCase() + "%"}`);
  if (filters.role) conditions.push(sql`role = ${filters.role}`);
  const where = conditions.reduce((acc, c) => sql`${acc} AND ${c}`);

  const { rows } = (await db.execute(sql`
    SELECT u.id, u.email, u.name, u.role, u.purchases_count, u.created_at, u.suspended_at, u.suspended_reason,
           EXISTS (
             SELECT 1 FROM audit_logs a
              WHERE a.entity_type = 'user' AND a.entity_id = u.id::text AND a.action = 'admin.role_removed'
           ) AS was_admin
      FROM users u
     WHERE ${where}
     ORDER BY u.created_at DESC
     LIMIT ${filters.limit}
  `)) as unknown as { rows: UserQueryRow[] };

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    purchasesCount: r.purchases_count,
    createdAt: new Date(r.created_at),
    suspendedAt: r.suspended_at ? new Date(r.suspended_at) : null,
    suspendedReason: r.suspended_reason,
    wasAdmin: r.was_admin,
  }));
}

export interface AdminUserDetail extends AdminUserRow {
  totalSpentCop: number;
  ordersCount: number;
  loyaltyTier: { id: string; name: string; discountPct: number } | null;
  activeSessionsCount: number;
}

export async function getUserDetailAdmin(db: Db, userId: string): Promise<AdminUserDetail | null> {
  const { rows: userRows } = (await db.execute(sql`
    SELECT u.id, u.email, u.name, u.role, u.purchases_count, u.created_at, u.suspended_at, u.suspended_reason,
           EXISTS (
             SELECT 1 FROM audit_logs a
              WHERE a.entity_type = 'user' AND a.entity_id = u.id::text AND a.action = 'admin.role_removed'
           ) AS was_admin
      FROM users u WHERE u.id = ${userId}::uuid
  `)) as unknown as { rows: UserQueryRow[] };
  const user = userRows[0];
  if (!user) return null;

  const [ordersAgg, tierRows, sessionRows] = await Promise.all([
    db.execute(sql`
      SELECT count(*) AS orders_count, coalesce(sum(total_cop) FILTER (WHERE payment_status = 'PAID'), 0) AS total_spent_cop
        FROM orders WHERE user_id = ${userId}::uuid
    `) as unknown as Promise<{ rows: Array<{ orders_count: string; total_spent_cop: string }> }>,
    db.execute(sql`
      SELECT id, name, discount_pct FROM loyalty_tiers
       WHERE is_active AND min_purchases <= ${user.purchases_count}
       ORDER BY min_purchases DESC LIMIT 1
    `) as unknown as Promise<{ rows: Array<{ id: string; name: string; discount_pct: string }> }>,
    db.execute(sql`
      SELECT count(*) AS active_sessions FROM sessions WHERE user_id = ${userId}::uuid AND expires_at > now()
    `) as unknown as Promise<{ rows: Array<{ active_sessions: string }> }>,
  ]);

  const tier = tierRows.rows[0];

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    purchasesCount: user.purchases_count,
    createdAt: new Date(user.created_at),
    suspendedAt: user.suspended_at ? new Date(user.suspended_at) : null,
    suspendedReason: user.suspended_reason,
    wasAdmin: user.was_admin,
    totalSpentCop: Number(ordersAgg.rows[0].total_spent_cop),
    ordersCount: Number(ordersAgg.rows[0].orders_count),
    loyaltyTier: tier ? { id: tier.id, name: tier.name, discountPct: Number(tier.discount_pct) } : null,
    activeSessionsCount: Number(sessionRows.rows[0].active_sessions),
  };
}

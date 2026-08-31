import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { withTransaction, type Db } from "../db/client";
import type { ValidatedSession } from "../auth/session";
import { DuplicateLoyaltyTierError, LoyaltyTierNotFoundError } from "./errors";
import { writeAudit } from "./audit";

/**
 * CRUD de niveles de fidelización — ADMIN-only (misma matriz de permisos
 * de fase 6A: "CRUD fidelización" no está entre lo que SUPPORT puede
 * hacer). `checkout-service.ts` sigue siendo quien decide el nivel de un
 * pedido real, leyendo esta misma tabla — acá solo se administra su
 * contenido, no se duplica la lógica de asignación.
 */

export const tierIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Usar minúsculas, números y guiones (slug)");

export const createTierSchema = z.object({
  id: tierIdSchema,
  name: z.string().trim().min(1).max(120),
  minPurchases: z.number().int().min(0).max(100_000),
  discountPct: z.number().min(0).max(100),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const updateTierSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  minPurchases: z.number().int().min(0).max(100_000).optional(),
  discountPct: z.number().min(0).max(100).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export type CreateTierInput = z.infer<typeof createTierSchema>;
export type UpdateTierInput = z.infer<typeof updateTierSchema>;

export interface AdminLoyaltyTier {
  id: string;
  name: string;
  minPurchases: number;
  discountPct: number;
  sortOrder: number;
  isActive: boolean;
}

interface TierRow {
  id: string;
  name: string;
  min_purchases: number;
  discount_pct: string;
  sort_order: number;
  is_active: boolean;
}

function toAdminTier(row: TierRow): AdminLoyaltyTier {
  return {
    id: row.id,
    name: row.name,
    minPurchases: row.min_purchases,
    discountPct: Number(row.discount_pct),
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

export async function listLoyaltyTiers(db: Db): Promise<AdminLoyaltyTier[]> {
  const { rows } = (await db.execute(
    sql`SELECT id, name, min_purchases, discount_pct, sort_order, is_active FROM loyalty_tiers ORDER BY sort_order`,
  )) as unknown as { rows: TierRow[] };
  return rows.map(toAdminTier);
}

export async function createLoyaltyTier(
  pool: Pool,
  actor: ValidatedSession,
  input: CreateTierInput,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    try {
      await tx.execute(sql`
        INSERT INTO loyalty_tiers (id, name, min_purchases, discount_pct, sort_order)
        VALUES (${input.id}, ${input.name}, ${input.minPurchases}, ${input.discountPct}, ${input.sortOrder})
      `);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new DuplicateLoyaltyTierError();
      throw error;
    }

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "loyalty_tier.created",
      entityType: "loyalty_tier",
      entityId: input.id,
      metadata: { minPurchases: input.minPurchases, discountPct: input.discountPct },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

export async function updateLoyaltyTier(
  pool: Pool,
  actor: ValidatedSession,
  tierId: string,
  input: UpdateTierInput,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const { rows: before } = (await tx.execute(
      sql`SELECT name, min_purchases, discount_pct, sort_order FROM loyalty_tiers WHERE id = ${tierId} FOR UPDATE`,
    )) as unknown as { rows: Array<{ name: string; min_purchases: number; discount_pct: string; sort_order: number }> };
    const previous = before[0];
    if (!previous) throw new LoyaltyTierNotFoundError(tierId);

    const next = {
      name: input.name ?? previous.name,
      minPurchases: input.minPurchases ?? previous.min_purchases,
      discountPct: input.discountPct ?? Number(previous.discount_pct),
      sortOrder: input.sortOrder ?? previous.sort_order,
    };

    try {
      await tx.execute(sql`
        UPDATE loyalty_tiers
           SET name = ${next.name}, min_purchases = ${next.minPurchases},
               discount_pct = ${next.discountPct}, sort_order = ${next.sortOrder}
         WHERE id = ${tierId}
      `);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new DuplicateLoyaltyTierError();
      throw error;
    }

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "loyalty_tier.updated",
      entityType: "loyalty_tier",
      entityId: tierId,
      metadata: {
        before: { minPurchases: previous.min_purchases, discountPct: Number(previous.discount_pct) },
        after: { minPurchases: next.minPurchases, discountPct: next.discountPct },
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

export async function setLoyaltyTierActive(
  pool: Pool,
  actor: ValidatedSession,
  tierId: string,
  isActive: boolean,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(
      sql`UPDATE loyalty_tiers SET is_active = ${isActive} WHERE id = ${tierId} RETURNING id`,
    )) as unknown as { rows: Array<{ id: string }> };
    if (rows.length === 0) throw new LoyaltyTierNotFoundError(tierId);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "loyalty_tier.toggled_active",
      entityType: "loyalty_tier",
      entityId: tierId,
      metadata: { isActive },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

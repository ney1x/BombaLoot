import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { withTransaction, type Db } from "../db/client";
import type { ValidatedSession } from "../auth/session";
import { DiscountRuleNotFoundError, DuplicateDiscountCodeError } from "./errors";
import { writeAudit } from "./audit";

/**
 * CRUD de reglas de descuento — ADMIN-only. `usesCount` es de solo
 * lectura acá: lo incrementa `checkout-service.ts` con la misma
 * disciplina de "condición en la propia escritura" que el resto del
 * sistema (no un SELECT-then-UPDATE) — este archivo nunca lo toca.
 */

const baseDiscountFields = {
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/, "Solo mayúsculas, números, guiones")
    .optional(),
  kind: z.enum(["PERCENT", "FIXED"]),
  value: z.number().positive().max(100_000_000),
  scope: z.enum(["ORDER", "GAME", "PRODUCT"]).default("ORDER"),
  scopeRef: z.string().trim().max(64).optional(),
  minSubtotalCop: z.number().int().min(0).max(100_000_000).default(0),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().max(1_000_000).optional(),
  maxUsesPerUser: z.number().int().positive().max(1000).optional(),
  stackable: z.boolean().default(false),
};

export const createDiscountSchema = z
  .object(baseDiscountFields)
  .refine((v) => v.kind !== "PERCENT" || v.value <= 100, {
    message: "Un descuento PERCENT no puede superar 100",
    path: ["value"],
  })
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, {
    message: "endsAt debe ser posterior a startsAt",
    path: ["endsAt"],
  });

export const updateDiscountSchema = z.object({
  value: z.number().positive().max(100_000_000).optional(),
  minSubtotalCop: z.number().int().min(0).max(100_000_000).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  maxUses: z.number().int().positive().max(1_000_000).nullable().optional(),
  maxUsesPerUser: z.number().int().positive().max(1000).nullable().optional(),
  stackable: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;
export type UpdateDiscountInput = z.infer<typeof updateDiscountSchema>;

export interface AdminDiscountRule {
  id: string;
  code: string | null;
  kind: string;
  value: number;
  scope: string;
  scopeRef: string | null;
  minSubtotalCop: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  usesCount: number;
  maxUsesPerUser: number | null;
  stackable: boolean;
  isActive: boolean;
  createdAt: Date;
}

interface DiscountRow {
  id: string;
  code: string | null;
  kind: string;
  value: string;
  scope: string;
  scope_ref: string | null;
  min_subtotal_cop: number;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  uses_count: number;
  max_uses_per_user: number | null;
  stackable: boolean;
  is_active: boolean;
  created_at: string;
}

function toAdminDiscount(row: DiscountRow): AdminDiscountRule {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    value: Number(row.value),
    scope: row.scope,
    scopeRef: row.scope_ref,
    minSubtotalCop: Number(row.min_subtotal_cop),
    startsAt: row.starts_at ? new Date(row.starts_at) : null,
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
    maxUses: row.max_uses,
    usesCount: row.uses_count,
    maxUsesPerUser: row.max_uses_per_user,
    stackable: row.stackable,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
  };
}

export async function listDiscountRules(db: Db): Promise<AdminDiscountRule[]> {
  const { rows } = (await db.execute(sql`
    SELECT id, code, kind, value, scope, scope_ref, min_subtotal_cop, starts_at, ends_at,
           max_uses, uses_count, max_uses_per_user, stackable, is_active, created_at
      FROM discount_rules
     ORDER BY created_at DESC
  `)) as unknown as { rows: DiscountRow[] };
  return rows.map(toAdminDiscount);
}

export async function createDiscountRule(
  pool: Pool,
  actor: ValidatedSession,
  input: CreateDiscountInput,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<string> {
  return withTransaction(pool, async (tx) => {
    let id: string;
    try {
      const { rows } = (await tx.execute(sql`
        INSERT INTO discount_rules
          (code, kind, value, scope, scope_ref, min_subtotal_cop, starts_at, ends_at, max_uses, max_uses_per_user, stackable)
        VALUES (
          ${input.code ?? null}, ${input.kind}, ${input.value}, ${input.scope}, ${input.scopeRef ?? null},
          ${input.minSubtotalCop}, ${input.startsAt ?? null}::timestamptz, ${input.endsAt ?? null}::timestamptz,
          ${input.maxUses ?? null}, ${input.maxUsesPerUser ?? null}, ${input.stackable}
        )
        RETURNING id
      `)) as unknown as { rows: Array<{ id: string }> };
      id = rows[0].id;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new DuplicateDiscountCodeError();
      throw error;
    }

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "discount.created",
      entityType: "discount_rule",
      entityId: id,
      // "discountCode", no "code" — la guarda de secretos de `writeAudit` rechaza cualquier
      // clave llamada `code` (pensada para códigos de inventario en claro). El código de un
      // cupón de descuento no es un secreto — es público, el cliente lo escribe en el checkout.
      metadata: { discountCode: input.code ?? null, kind: input.kind, value: input.value, scope: input.scope },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return id;
  });
}

export async function updateDiscountRule(
  pool: Pool,
  actor: ValidatedSession,
  discountId: string,
  input: UpdateDiscountInput,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const { rows: before } = (await tx.execute(sql`
      SELECT value, min_subtotal_cop, starts_at, ends_at, max_uses, max_uses_per_user, stackable, is_active
        FROM discount_rules WHERE id = ${discountId}::uuid FOR UPDATE
    `)) as unknown as {
      rows: Array<{
        value: string;
        min_subtotal_cop: number;
        starts_at: string | null;
        ends_at: string | null;
        max_uses: number | null;
        max_uses_per_user: number | null;
        stackable: boolean;
        is_active: boolean;
      }>;
    };
    const previous = before[0];
    if (!previous) throw new DiscountRuleNotFoundError(discountId);

    const next = {
      value: input.value ?? Number(previous.value),
      minSubtotalCop: input.minSubtotalCop ?? previous.min_subtotal_cop,
      startsAt: input.startsAt === undefined ? previous.starts_at : input.startsAt,
      endsAt: input.endsAt === undefined ? previous.ends_at : input.endsAt,
      maxUses: input.maxUses === undefined ? previous.max_uses : input.maxUses,
      maxUsesPerUser: input.maxUsesPerUser === undefined ? previous.max_uses_per_user : input.maxUsesPerUser,
      stackable: input.stackable ?? previous.stackable,
      isActive: input.isActive ?? previous.is_active,
    };

    await tx.execute(sql`
      UPDATE discount_rules
         SET value = ${next.value}, min_subtotal_cop = ${next.minSubtotalCop},
             starts_at = ${next.startsAt}::timestamptz, ends_at = ${next.endsAt}::timestamptz,
             max_uses = ${next.maxUses}, max_uses_per_user = ${next.maxUsesPerUser},
             stackable = ${next.stackable}, is_active = ${next.isActive}
       WHERE id = ${discountId}::uuid
    `);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "discount.updated",
      entityType: "discount_rule",
      entityId: discountId,
      metadata: { before: { value: Number(previous.value) }, after: { value: next.value } },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

export async function setDiscountRuleActive(
  pool: Pool,
  actor: ValidatedSession,
  discountId: string,
  isActive: boolean,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(
      sql`UPDATE discount_rules SET is_active = ${isActive} WHERE id = ${discountId}::uuid RETURNING id`,
    )) as unknown as { rows: Array<{ id: string }> };
    if (rows.length === 0) throw new DiscountRuleNotFoundError(discountId);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "discount.toggled_active",
      entityType: "discount_rule",
      entityId: discountId,
      metadata: { isActive },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

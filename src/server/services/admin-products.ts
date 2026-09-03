import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { withTransaction, type Db } from "../db/client";
import type { ValidatedSession } from "../auth/session";
import { DuplicateProductError, InvalidGameError, ProductNotFoundError } from "./errors";
import { writeAudit } from "./audit";

/**
 * CRUD de productos para el panel admin. Sin DELETE físico a propósito
 * (ver 0006_admin_products.sql) — `isActive` es el único "borrado" que
 * existe, y no toca ninguna fila de `order_items`/`codes` que ya
 * referencien el producto.
 */

export const productIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Usar minúsculas, números y guiones (slug)");

export const createProductSchema = z.object({
  id: productIdSchema,
  gameId: z.string().trim().min(1).max(64),
  denomination: z.string().trim().min(1).max(64),
  unit: z.string().trim().min(1).max(32),
  description: z.string().trim().max(2000).optional(),
  priceCop: z.number().int().positive().max(100_000_000),
  maxPerOrder: z.number().int().positive().max(1000).default(10),
  lowStockAt: z.number().int().min(0).max(1000).default(5),
  /**
   * `false` por default a propósito — a diferencia del `DEFAULT true` de la
   * columna en la base. Un producto recién creado no tiene códigos ni
   * imágenes todavía; publicarlo activo de entrada lo pone en el catálogo
   * público vacío y "agotado" antes de que el admin termine de cargarlo
   * (verificado en vivo). El admin lo activa a mano cuando ya está listo.
   */
  isActive: z.boolean().default(false),
});

export const updateProductSchema = z.object({
  denomination: z.string().trim().min(1).max(64).optional(),
  unit: z.string().trim().min(1).max(32).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  priceCop: z.number().int().positive().max(100_000_000).optional(),
  maxPerOrder: z.number().int().positive().max(1000).optional(),
  lowStockAt: z.number().int().min(0).max(1000).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export interface AdminProductRow {
  id: string;
  gameId: string;
  gameLabel: string;
  denomination: string;
  unit: string;
  description: string | null;
  priceCop: number;
  maxPerOrder: number;
  lowStockAt: number;
  isActive: boolean;
  available: number;
  reserved: number;
  paid: number;
  delivered: number;
  stock: "available" | "low" | "out";
  createdAt: Date;
  updatedAt: Date;
}

interface ProductQueryRow {
  id: string;
  game_id: string;
  game_label: string;
  denomination: string;
  unit: string;
  description: string | null;
  price_cop: number;
  max_per_order: number;
  low_stock_at: number;
  is_active: boolean;
  available: string;
  reserved: string;
  paid: string;
  delivered: string;
  created_at: string;
  updated_at: string;
}

/**
 * Drizzle envuelve el error real de `pg` en su propio `DrizzleQueryError` —
 * `code`/`constraint` viven en `error.cause`, no en el error de arriba.
 * Chequear solo el error de arriba (como hacía antes esta función) hace que
 * la colisión de `products_pkey`/`products_variant_key` nunca se detecte y
 * se cuele como un 500 genérico — verificado en vivo. Mismo bug, mismo
 * fix, que `isIdempotencyKeyConflict` en `checkout-service.ts`.
 */
function isDuplicateProductConflict(error: unknown): boolean {
  const withPgCode = (candidate: unknown): candidate is { code?: string } =>
    typeof candidate === "object" && candidate !== null;

  for (const candidate of [error, (error as { cause?: unknown } | undefined)?.cause]) {
    if (withPgCode(candidate) && candidate.code === "23505") return true;
  }
  return false;
}

function stockStateFor(available: number, lowStockAt: number): AdminProductRow["stock"] {
  if (available <= 0) return "out";
  if (available <= lowStockAt) return "low";
  return "available";
}

function toAdminProductRow(row: ProductQueryRow): AdminProductRow {
  const available = Number(row.available);
  return {
    id: row.id,
    gameId: row.game_id,
    gameLabel: row.game_label,
    denomination: row.denomination,
    unit: row.unit,
    description: row.description,
    priceCop: Number(row.price_cop),
    maxPerOrder: row.max_per_order,
    lowStockAt: row.low_stock_at,
    isActive: row.is_active,
    available,
    reserved: Number(row.reserved),
    paid: Number(row.paid),
    delivered: Number(row.delivered),
    stock: stockStateFor(available, row.low_stock_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * A diferencia del catálogo público (`catalog.ts`), acá se listan TODOS los
 * productos — activos e inactivos — y con el desglose completo por estado
 * de código, no solo el disponible. Es una vista operativa, no de venta.
 */
export async function listAdminProducts(db: Db): Promise<AdminProductRow[]> {
  const { rows } = (await db.execute(sql`
    SELECT p.id, p.game_id, g.label AS game_label, p.denomination, p.unit, p.description,
           p.price_cop, p.max_per_order, p.low_stock_at, p.is_active, p.created_at, p.updated_at,
           count(*) FILTER (WHERE c.status = 'AVAILABLE' AND c.order_item_id IS NULL) AS available,
           count(*) FILTER (WHERE c.status = 'RESERVED') AS reserved,
           count(*) FILTER (WHERE c.status = 'PAID') AS paid,
           count(*) FILTER (WHERE c.status = 'DELIVERED') AS delivered
      FROM products p
      JOIN games g ON g.id = p.game_id
      LEFT JOIN codes c ON c.product_id = p.id
     GROUP BY p.id, g.id
     ORDER BY g.sort_order, p.denomination
  `)) as unknown as { rows: ProductQueryRow[] };

  return rows.map(toAdminProductRow);
}

export async function getAdminProduct(db: Db, productId: string): Promise<AdminProductRow | null> {
  const { rows } = (await db.execute(sql`
    SELECT p.id, p.game_id, g.label AS game_label, p.denomination, p.unit, p.description,
           p.price_cop, p.max_per_order, p.low_stock_at, p.is_active, p.created_at, p.updated_at,
           count(*) FILTER (WHERE c.status = 'AVAILABLE' AND c.order_item_id IS NULL) AS available,
           count(*) FILTER (WHERE c.status = 'RESERVED') AS reserved,
           count(*) FILTER (WHERE c.status = 'PAID') AS paid,
           count(*) FILTER (WHERE c.status = 'DELIVERED') AS delivered
      FROM products p
      JOIN games g ON g.id = p.game_id
      LEFT JOIN codes c ON c.product_id = p.id
     WHERE p.id = ${productId}
     GROUP BY p.id, g.id
  `)) as unknown as { rows: ProductQueryRow[] };

  const row = rows[0];
  return row ? toAdminProductRow(row) : null;
}

export interface AdminGame {
  id: string;
  label: string;
}

export async function listGames(db: Db): Promise<AdminGame[]> {
  const { rows } = (await db.execute(
    sql`SELECT id, label FROM games WHERE is_active ORDER BY sort_order`,
  )) as unknown as { rows: AdminGame[] };
  return rows;
}

export async function createProduct(
  pool: Pool,
  actor: ValidatedSession,
  input: CreateProductInput,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const { rows: gameRows } = (await tx.execute(
      sql`SELECT 1 FROM games WHERE id = ${input.gameId}`,
    )) as unknown as { rows: unknown[] };
    if (gameRows.length === 0) throw new InvalidGameError(input.gameId);

    try {
      await tx.execute(sql`
        INSERT INTO products (id, game_id, denomination, unit, description, price_cop, max_per_order, low_stock_at, is_active)
        VALUES (${input.id}, ${input.gameId}, ${input.denomination}, ${input.unit}, ${input.description ?? null},
                ${input.priceCop}, ${input.maxPerOrder}, ${input.lowStockAt}, ${input.isActive})
      `);
    } catch (error) {
      if (isDuplicateProductConflict(error)) {
        throw new DuplicateProductError(
          `Ya existe un producto con id "${input.id}" o con la misma combinación juego/denominación/unidad`,
        );
      }
      throw error;
    }

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "product.created",
      entityType: "product",
      entityId: input.id,
      metadata: {
        gameId: input.gameId,
        denomination: input.denomination,
        unit: input.unit,
        priceCop: input.priceCop,
        isActive: input.isActive,
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

export async function updateProduct(
  pool: Pool,
  actor: ValidatedSession,
  productId: string,
  input: UpdateProductInput,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const { rows: before } = (await tx.execute(
      sql`SELECT denomination, unit, description, price_cop, max_per_order, low_stock_at
            FROM products WHERE id = ${productId} FOR UPDATE`,
    )) as unknown as {
      rows: Array<{
        denomination: string;
        unit: string;
        description: string | null;
        price_cop: number;
        max_per_order: number;
        low_stock_at: number;
      }>;
    };
    const previous = before[0];
    if (!previous) throw new ProductNotFoundError(productId);

    const next = {
      denomination: input.denomination ?? previous.denomination,
      unit: input.unit ?? previous.unit,
      description: input.description === undefined ? previous.description : input.description,
      priceCop: input.priceCop ?? Number(previous.price_cop),
      maxPerOrder: input.maxPerOrder ?? previous.max_per_order,
      lowStockAt: input.lowStockAt ?? previous.low_stock_at,
    };

    await tx.execute(sql`
      UPDATE products
         SET denomination = ${next.denomination}, unit = ${next.unit}, description = ${next.description},
             price_cop = ${next.priceCop}, max_per_order = ${next.maxPerOrder}, low_stock_at = ${next.lowStockAt},
             updated_at = now()
       WHERE id = ${productId}
    `);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "product.updated",
      entityType: "product",
      entityId: productId,
      metadata: {
        before: { priceCop: Number(previous.price_cop), maxPerOrder: previous.max_per_order, lowStockAt: previous.low_stock_at },
        after: { priceCop: next.priceCop, maxPerOrder: next.maxPerOrder, lowStockAt: next.lowStockAt },
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

export async function setProductActive(
  pool: Pool,
  actor: ValidatedSession,
  productId: string,
  isActive: boolean,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(
      sql`UPDATE products SET is_active = ${isActive}, updated_at = now() WHERE id = ${productId} RETURNING id`,
    )) as unknown as { rows: Array<{ id: string }> };
    if (rows.length === 0) throw new ProductNotFoundError(productId);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "product.toggled_active",
      entityType: "product",
      entityId: productId,
      metadata: { isActive },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { withTransaction, type Db } from "../db/client";
import type { ValidatedSession } from "../auth/session";
import { GameVisualNotFoundError, ProductGameMismatchError } from "./errors";
import { imageUrlSchema } from "./admin-images";
import { writeAudit } from "./audit";

/**
 * Banners por juego (`game_visuals`, migración 0007) — hero grande de Home
 * (1200×1440), "Elegí tu juego" (600×800, recortado vía `object-fit: cover`)
 * y, desde la migración 0025, el fallback de la imagen cuadrada (680×680)
 * de `/catalogo/[game]` cuando la denominación elegida no tiene su propia
 * imagen en `product_images`. A diferencia de `product_images` no hay
 * noción de "principal": el que se muestra es el activo, dentro de su
 * ventana de vigencia si tiene una, con el `sort_order` más bajo — el
 * primero de la cola.
 *
 * `productId` (migración 0018) es opcional: NULL sigue siendo el banner
 * genérico del juego (fallback de siempre); una fila con `productId`
 * apunta a UNA denominación puntual — solo tiene efecto en `placement:
 * "hero"` (el rotator de Home es lo único que rota por producto; "Elegí tu
 * juego" y el fallback de catálogo siempre fueron uno por juego, no por
 * denominación — el catálogo ya tiene su propio mecanismo por producto vía
 * `product_images`, no hace falta duplicarlo acá).
 */

export const GAME_VISUAL_PLACEMENTS = ["hero", "showcase", "catalog"] as const;
export type GameVisualPlacement = (typeof GAME_VISUAL_PLACEMENTS)[number];

export const addGameVisualSchema = z.object({
  imageUrl: imageUrlSchema,
  placement: z.enum(GAME_VISUAL_PLACEMENTS),
  productId: z.string().trim().min(1).max(64).optional(),
  title: z.string().trim().max(200).optional(),
  ctaText: z.string().trim().max(80).optional(),
  ctaLink: z.string().trim().max(2000).optional(),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export type AddGameVisualInput = z.infer<typeof addGameVisualSchema>;

export interface AdminGameVisual {
  id: string;
  gameId: string;
  productId: string | null;
  imageUrl: string;
  placement: GameVisualPlacement;
  title: string | null;
  ctaText: string | null;
  ctaLink: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
}

interface VisualQueryRow {
  id: string;
  game_id: string;
  product_id: string | null;
  image_url: string;
  placement: GameVisualPlacement;
  title: string | null;
  cta_text: string | null;
  cta_link: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

function toAdminVisual(row: VisualQueryRow): AdminGameVisual {
  return {
    id: row.id,
    gameId: row.game_id,
    productId: row.product_id,
    imageUrl: row.image_url,
    placement: row.placement,
    title: row.title,
    ctaText: row.cta_text,
    ctaLink: row.cta_link,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
  };
}

export async function listGameVisuals(db: Db, gameId: string): Promise<AdminGameVisual[]> {
  const { rows } = (await db.execute(sql`
    SELECT id, game_id, product_id, image_url, placement, title, cta_text, cta_link, sort_order, is_active, created_at
      FROM game_visuals
     WHERE game_id = ${gameId}
     ORDER BY placement, sort_order, created_at
  `)) as unknown as { rows: VisualQueryRow[] };
  return rows.map(toAdminVisual);
}

/**
 * El banner genérico activo (dentro de vigencia) por juego Y lugar — el
 * fallback que efectivamente se ve cuando un producto no tiene uno propio.
 * `product_id IS NULL` a propósito: una fila específica de un producto
 * nunca debe colarse acá como "la" del juego entero. `Map` sale vacío para
 * juegos sin ninguno todavía en ese `placement` (los llamadores caen al
 * placeholder de `GameImageSlot`). Hero y showcase se resuelven por
 * separado: son imágenes distintas, no el mismo banner recortado.
 */
export async function getActiveGameVisualMap(
  db: Db,
  placement: GameVisualPlacement,
): Promise<Map<string, string>> {
  const { rows } = (await db.execute(sql`
    SELECT DISTINCT ON (game_id) game_id, image_url
      FROM game_visuals
     WHERE is_active
       AND placement = ${placement}
       AND product_id IS NULL
       AND (valid_from IS NULL OR valid_from <= now())
       AND (valid_until IS NULL OR valid_until > now())
     ORDER BY game_id, sort_order, created_at
  `)) as unknown as { rows: Array<{ game_id: string; image_url: string }> };
  return new Map(rows.map((r) => [r.game_id, r.image_url]));
}

/**
 * Igual que `getActiveGameVisualMap`, pero para los banners de UNA
 * denominación puntual — la clave es `product_id`, no `game_id`. Quien
 * llama resuelve el fallback: `productMap.get(product.id) ??
 * gameMap.get(product.gameId)`.
 */
export async function getActiveProductVisualMap(
  db: Db,
  placement: GameVisualPlacement,
): Promise<Map<string, string>> {
  const { rows } = (await db.execute(sql`
    SELECT DISTINCT ON (product_id) product_id, image_url
      FROM game_visuals
     WHERE is_active
       AND placement = ${placement}
       AND product_id IS NOT NULL
       AND (valid_from IS NULL OR valid_from <= now())
       AND (valid_until IS NULL OR valid_until > now())
     ORDER BY product_id, sort_order, created_at
  `)) as unknown as { rows: Array<{ product_id: string; image_url: string }> };
  return new Map(rows.map((r) => [r.product_id, r.image_url]));
}

export async function addGameVisual(
  pool: Pool,
  actor: ValidatedSession,
  gameId: string,
  input: AddGameVisualInput,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<string> {
  return withTransaction(pool, async (tx) => {
    if (input.productId) {
      const { rows: productRows } = (await tx.execute(
        sql`SELECT 1 FROM products WHERE id = ${input.productId} AND game_id = ${gameId}`,
      )) as unknown as { rows: unknown[] };
      if (productRows.length === 0) throw new ProductGameMismatchError(input.productId, gameId);
    }

    const { rows } = (await tx.execute(sql`
      INSERT INTO game_visuals (game_id, product_id, image_url, placement, title, cta_text, cta_link, sort_order)
      VALUES (${gameId}, ${input.productId ?? null}, ${input.imageUrl}, ${input.placement}, ${input.title ?? null}, ${input.ctaText ?? null}, ${input.ctaLink ?? null}, ${input.sortOrder})
      RETURNING id
    `)) as unknown as { rows: Array<{ id: string }> };

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "game_visual.added",
      entityType: "game",
      entityId: gameId,
      metadata: { visualId: rows[0].id, productId: input.productId ?? null },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return rows[0].id;
  });
}

export async function toggleGameVisualActive(
  pool: Pool,
  actor: ValidatedSession,
  visualId: string,
  isActive: boolean,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(
      sql`UPDATE game_visuals SET is_active = ${isActive}, updated_at = now() WHERE id = ${visualId}::uuid RETURNING game_id`,
    )) as unknown as { rows: Array<{ game_id: string }> };
    const row = rows[0];
    if (!row) throw new GameVisualNotFoundError(visualId);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "game_visual.updated",
      entityType: "game",
      entityId: row.game_id,
      metadata: { visualId, isActive },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

export async function deleteGameVisual(
  pool: Pool,
  actor: ValidatedSession,
  visualId: string,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(
      sql`DELETE FROM game_visuals WHERE id = ${visualId}::uuid RETURNING game_id`,
    )) as unknown as { rows: Array<{ game_id: string }> };
    const row = rows[0];
    if (!row) throw new GameVisualNotFoundError(visualId);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "game_visual.deleted",
      entityType: "game",
      entityId: row.game_id,
      metadata: { visualId },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { withTransaction, type Db } from "../db/client";
import type { ValidatedSession } from "../auth/session";
import { ImageNotFoundError, ProductNotFoundError } from "./errors";
import { writeAudit } from "./audit";

/**
 * Imágenes de producto. Sin binarios en Postgres — solo `image_url`,
 * apuntando a un CDN/object storage externo. No hay endpoint de subida de
 * archivo en esta fase: no hay credenciales de storage configuradas
 * todavía (ver comentario de cabecera en 0007_product_images.sql), así
 * que el admin pega la URL de una imagen ya alojada, igual que se pediría
 * si hubiera un botón de "subir" que hoy no existe de verdad.
 *
 * A lo sumo una imagen principal activa por producto — lo garantiza
 * `product_images_one_primary_idx` (índice único parcial) en la base, no
 * una convención acá. `setPrimaryImage` por eso hace las dos escrituras
 * (bajar la anterior, subir la nueva) en la misma transacción.
 */

/**
 * Acepta una URL absoluta o una ruta local que arranca en `/` (sirve del
 * propio `/public` de Next) — no hay CDN real configurado todavía (ver
 * comentario de cabecera de la migración 0007), así que una ruta local es
 * el reemplazo honesto de "ya alojada en un CDN" mientras tanto.
 */
export const imageUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((v) => v.startsWith("/") || /^https?:\/\//.test(v), {
    message: "Tiene que ser una URL (https://...) o una ruta local que empiece con /",
  });

export const addImageSchema = z.object({
  imageUrl: imageUrlSchema,
  altText: z.string().trim().max(300).optional(),
  isPrimary: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export const updateImageSchema = z.object({
  altText: z.string().trim().max(300).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});

export type AddImageInput = z.infer<typeof addImageSchema>;
export type UpdateImageInput = z.infer<typeof updateImageSchema>;

export interface AdminProductImage {
  id: string;
  productId: string;
  imageUrl: string;
  altText: string | null;
  isPrimary: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
}

interface ImageQueryRow {
  id: string;
  product_id: string;
  image_url: string;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

function toAdminImage(row: ImageQueryRow): AdminProductImage {
  return {
    id: row.id,
    productId: row.product_id,
    imageUrl: row.image_url,
    altText: row.alt_text,
    isPrimary: row.is_primary,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
  };
}

export async function listProductImages(db: Db, productId: string): Promise<AdminProductImage[]> {
  const { rows } = (await db.execute(sql`
    SELECT id, product_id, image_url, alt_text, is_primary, sort_order, is_active, created_at
      FROM product_images
     WHERE product_id = ${productId}
     ORDER BY sort_order, created_at
  `)) as unknown as { rows: ImageQueryRow[] };
  return rows.map(toAdminImage);
}

export async function addProductImage(
  pool: Pool,
  actor: ValidatedSession,
  productId: string,
  input: AddImageInput,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<string> {
  return withTransaction(pool, async (tx) => {
    const { rows: productRows } = (await tx.execute(
      sql`SELECT 1 FROM products WHERE id = ${productId}`,
    )) as unknown as { rows: unknown[] };
    if (productRows.length === 0) throw new ProductNotFoundError(productId);

    if (input.isPrimary) {
      await tx.execute(
        sql`UPDATE product_images SET is_primary = false, updated_at = now() WHERE product_id = ${productId} AND is_primary`,
      );
    }

    const { rows } = (await tx.execute(sql`
      INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order)
      VALUES (${productId}, ${input.imageUrl}, ${input.altText ?? null}, ${input.isPrimary}, ${input.sortOrder})
      RETURNING id
    `)) as unknown as { rows: Array<{ id: string }> };

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "product_image.added",
      entityType: "product",
      entityId: productId,
      metadata: { imageId: rows[0].id, isPrimary: input.isPrimary },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return rows[0].id;
  });
}

export async function updateProductImage(
  pool: Pool,
  actor: ValidatedSession,
  imageId: string,
  input: UpdateImageInput,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const { rows: before } = (await tx.execute(
      sql`SELECT product_id, alt_text, sort_order, is_active FROM product_images WHERE id = ${imageId}::uuid FOR UPDATE`,
    )) as unknown as {
      rows: Array<{ product_id: string; alt_text: string | null; sort_order: number; is_active: boolean }>;
    };
    const previous = before[0];
    if (!previous) throw new ImageNotFoundError(imageId);

    const next = {
      altText: input.altText === undefined ? previous.alt_text : input.altText,
      sortOrder: input.sortOrder ?? previous.sort_order,
      isActive: input.isActive ?? previous.is_active,
    };

    await tx.execute(sql`
      UPDATE product_images
         SET alt_text = ${next.altText}, sort_order = ${next.sortOrder}, is_active = ${next.isActive}, updated_at = now()
       WHERE id = ${imageId}::uuid
    `);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "product_image.updated",
      entityType: "product",
      entityId: previous.product_id,
      metadata: { imageId, isActive: next.isActive, sortOrder: next.sortOrder },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

/** Marca esta imagen como principal y baja cualquier otra que lo fuera — atómico. */
export async function setPrimaryImage(
  pool: Pool,
  actor: ValidatedSession,
  imageId: string,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(
      sql`SELECT product_id FROM product_images WHERE id = ${imageId}::uuid FOR UPDATE`,
    )) as unknown as { rows: Array<{ product_id: string }> };
    const image = rows[0];
    if (!image) throw new ImageNotFoundError(imageId);

    await tx.execute(
      sql`UPDATE product_images SET is_primary = false, updated_at = now() WHERE product_id = ${image.product_id} AND is_primary`,
    );
    await tx.execute(
      sql`UPDATE product_images SET is_primary = true, is_active = true, updated_at = now() WHERE id = ${imageId}::uuid`,
    );

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "product_image.updated",
      entityType: "product",
      entityId: image.product_id,
      metadata: { imageId, setPrimary: true },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

export async function deleteProductImage(
  pool: Pool,
  actor: ValidatedSession,
  imageId: string,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(
      sql`DELETE FROM product_images WHERE id = ${imageId}::uuid RETURNING product_id`,
    )) as unknown as { rows: Array<{ product_id: string }> };
    const deleted = rows[0];
    if (!deleted) throw new ImageNotFoundError(imageId);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "product_image.deleted",
      entityType: "product",
      entityId: deleted.product_id,
      metadata: { imageId },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

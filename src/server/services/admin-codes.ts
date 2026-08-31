import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { withTransaction, type Db, type TxDb } from "../db/client";
import type { ValidatedSession } from "../auth/session";
import { decryptCode, encryptCode, fingerprintCode } from "../crypto/codes";
import { CodeNotEditableError, CodeNotFoundError, CodeNotOwnedError, DuplicateCodeError, ProductNotFoundError } from "./errors";
import { writeAudit } from "./audit";

/**
 * Gestión de códigos desde el admin. Regla que gobierna todo el archivo:
 * **solo se puede tocar (editar o eliminar) un código en `AVAILABLE`, sin
 * reserva ni pedido**. El trigger `codes_prevent_sold_regression_trg`
 * (0005) ya bloquea a nivel de base cualquier UPDATE que intente mover un
 * código PAID/DELIVERED — pero no cubre DELETE, así que el chequeo de
 * estado acá adentro es la única defensa contra borrar un código vendido.
 * Se hace con `FOR UPDATE` para que la comprobación de estado y la
 * escritura sean atómicas frente a un webhook que lo reclame al mismo
 * tiempo.
 *
 * Nunca se devuelve el código en claro en ninguna función de este
 * archivo — ni al listar, ni al confirmar una edición. El fingerprint (hex)
 * es lo único identificable que sale hacia afuera.
 */

export const addCodesSchema = z.object({
  codes: z
    .array(z.string().trim().min(3).max(64))
    .min(1, "Pegá al menos un código")
    .max(500, "Máximo 500 códigos por carga"),
  note: z.string().trim().max(500).optional(),
});

export const editCodeSchema = z.object({
  code: z.string().trim().min(3).max(64),
});

export interface AdminCodeRow {
  id: string;
  status: string;
  fingerprint: string;
  orderItemId: string | null;
  reservedUntil: Date | null;
  createdAt: Date;
  deliveredAt: Date | null;
  uploadedById: string | null;
  uploadedByName: string | null;
}

interface CodeQueryRow {
  id: string;
  status: string;
  secret_fingerprint: Buffer;
  order_item_id: string | null;
  reserved_until: string | null;
  created_at: string;
  delivered_at: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  uploaded_by_email: string | null;
}

function toAdminCodeRow(row: CodeQueryRow): AdminCodeRow {
  return {
    id: row.id,
    status: row.status,
    fingerprint: row.secret_fingerprint.toString("hex").slice(0, 16),
    orderItemId: row.order_item_id,
    reservedUntil: row.reserved_until ? new Date(row.reserved_until) : null,
    createdAt: new Date(row.created_at),
    deliveredAt: row.delivered_at ? new Date(row.delivered_at) : null,
    uploadedById: row.uploaded_by,
    uploadedByName: row.uploaded_by ? row.uploaded_by_name || row.uploaded_by_email : null,
  };
}

export async function listCodesForProduct(db: Db, productId: string): Promise<AdminCodeRow[]> {
  const { rows } = (await db.execute(sql`
    SELECT c.id, c.status, c.secret_fingerprint, c.order_item_id, c.reserved_until, c.created_at, c.delivered_at,
           b.uploaded_by, u.name AS uploaded_by_name, u.email AS uploaded_by_email
      FROM codes c
      LEFT JOIN code_batches b ON b.id = c.batch_id
      LEFT JOIN users u ON u.id = b.uploaded_by
     WHERE c.product_id = ${productId}
     ORDER BY c.created_at DESC
     LIMIT 500
  `)) as unknown as { rows: CodeQueryRow[] };
  return rows.map(toAdminCodeRow);
}

export interface BulkAddResult {
  inserted: number;
  duplicates: number;
}

export async function bulkAddCodes(
  pool: Pool,
  actor: ValidatedSession,
  productId: string,
  plainCodes: string[],
  note: string | undefined,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<BulkAddResult> {
  return withTransaction(pool, async (tx) => {
    const { rows: productRows } = (await tx.execute(
      sql`SELECT 1 FROM products WHERE id = ${productId}`,
    )) as unknown as { rows: unknown[] };
    if (productRows.length === 0) throw new ProductNotFoundError(productId);

    const { rows: batchRows } = (await tx.execute(sql`
      INSERT INTO code_batches (product_id, uploaded_by, source, note)
      VALUES (${productId}, ${actor.userId}::uuid, 'admin', ${note ?? null})
      RETURNING id
    `)) as unknown as { rows: Array<{ id: string }> };
    const batchId = batchRows[0].id;

    let inserted = 0;
    for (const plain of plainCodes) {
      const encrypted = encryptCode(plain);
      const { rowCount } = (await tx.execute(sql`
        INSERT INTO codes (product_id, secret_cipher, secret_nonce, secret_tag, secret_fingerprint, batch_id)
        VALUES (${productId}, ${encrypted.cipher}, ${encrypted.nonce}, ${encrypted.tag}, ${encrypted.fingerprint}, ${batchId}::uuid)
        ON CONFLICT (secret_fingerprint) DO NOTHING
      `)) as unknown as { rowCount: number | null };
      if (rowCount) inserted += 1;
    }

    const duplicates = plainCodes.length - inserted;

    // Nunca se guardan los códigos en el metadata del audit — solo cuántos
    // entraron y cuántos ya existían.
    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "code.uploaded",
      entityType: "product",
      entityId: productId,
      metadata: { batchId, requested: plainCodes.length, inserted, duplicates },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { inserted, duplicates };
  });
}

async function lockEditableCode(
  tx: TxDb,
  actor: ValidatedSession,
  codeId: string,
): Promise<{ id: string; status: string; productId: string }> {
  // `FOR UPDATE` sobre codes; el join a code_batches solo lee el dueño del
  // lote, no hace falta lockearlo — nadie más edita `uploaded_by`.
  const { rows } = (await tx.execute(sql`
    SELECT c.id, c.status, c.product_id, b.uploaded_by
      FROM codes c
      LEFT JOIN code_batches b ON b.id = c.batch_id
     WHERE c.id = ${codeId}::uuid
       FOR UPDATE OF c
  `)) as unknown as { rows: Array<{ id: string; status: string; product_id: string; uploaded_by: string | null }> };

  const row = rows[0];
  if (!row) throw new CodeNotFoundError(codeId);
  if (row.status !== "AVAILABLE") throw new CodeNotEditableError(codeId, row.status);
  if (row.uploaded_by && row.uploaded_by !== actor.userId) throw new CodeNotOwnedError(codeId);
  return { id: row.id, status: row.status, productId: row.product_id };
}

/**
 * Corrige un código escrito mal — solo si sigue en `AVAILABLE`. Recifra
 * con la misma clave y recalcula el fingerprint; si el nuevo valor
 * coincide con un código que ya existe en el inventario, se rechaza (el
 * UNIQUE de `secret_fingerprint` es la fuente real de verdad, esto solo
 * traduce esa violación a un error de dominio).
 */
export async function editCode(
  pool: Pool,
  actor: ValidatedSession,
  codeId: string,
  newPlainCode: string,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    await lockEditableCode(tx, actor, codeId);

    const { rows: beforeRows } = (await tx.execute(
      sql`SELECT secret_fingerprint FROM codes WHERE id = ${codeId}::uuid`,
    )) as unknown as { rows: Array<{ secret_fingerprint: Buffer }> };
    const beforeFingerprint = beforeRows[0].secret_fingerprint.toString("hex").slice(0, 16);

    const encrypted = encryptCode(newPlainCode);

    try {
      await tx.execute(sql`
        UPDATE codes
           SET secret_cipher = ${encrypted.cipher}, secret_nonce = ${encrypted.nonce},
               secret_tag = ${encrypted.tag}, secret_fingerprint = ${encrypted.fingerprint}
         WHERE id = ${codeId}::uuid
      `);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new DuplicateCodeError();
      }
      throw error;
    }

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "code.edited",
      entityType: "code",
      entityId: codeId,
      metadata: {
        beforeFingerprint,
        afterFingerprint: fingerprintCode(newPlainCode).toString("hex").slice(0, 16),
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

/**
 * Revela el código en claro — solo para corregir un error de escritura
 * antes de vender (misma regla que editar: `AVAILABLE` y dueño del lote).
 * Cada revelado queda auditado (`code.revealed`), igual que un edit o un
 * delete — es la única función del archivo que expone el secreto.
 */
export async function revealCode(
  pool: Pool,
  actor: ValidatedSession,
  codeId: string,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<string> {
  return withTransaction(pool, async (tx) => {
    await lockEditableCode(tx, actor, codeId);

    const { rows } = (await tx.execute(
      sql`SELECT secret_cipher, secret_nonce, secret_tag FROM codes WHERE id = ${codeId}::uuid`,
    )) as unknown as { rows: Array<{ secret_cipher: Buffer; secret_nonce: Buffer; secret_tag: Buffer }> };
    const row = rows[0];
    if (!row) throw new CodeNotFoundError(codeId);

    const plain = decryptCode({ cipher: row.secret_cipher, nonce: row.secret_nonce, tag: row.secret_tag });

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "code.revealed",
      entityType: "code",
      entityId: codeId,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return plain;
  });
}

export async function deleteCode(
  pool: Pool,
  actor: ValidatedSession,
  codeId: string,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await withTransaction(pool, async (tx) => {
    await lockEditableCode(tx, actor, codeId);

    await tx.execute(sql`DELETE FROM codes WHERE id = ${codeId}::uuid`);

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "code.deleted",
      entityType: "code",
      entityId: codeId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  });
}

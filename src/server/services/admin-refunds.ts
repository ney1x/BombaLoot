import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { withTransaction, type Db } from "../db/client";
import type { ValidatedSession } from "../auth/session";
import { RefundNotPendingManualReviewError, RefundOrderMismatchError, RefundRequestNotFoundError } from "./errors";
import { writeAudit } from "./audit";
import { refundCompletedEmail, sendMail } from "./mailer";

/**
 * Reembolsos manuales. Este archivo NUNCA llama a Wompi/PayPal — a
 * diferencia de `payment/refund-service.ts` (el worker automático), acá el
 * admin está registrando el resultado de una acción que ya ejecutó por
 * fuera del sistema (consola de Wompi, panel de PayPal, transferencia
 * manual). No hay "forzar completado" sin evidencia: `providerRefundId` y
 * `comment` son obligatorios, y la condición `status = 'MANUAL_REVIEW_REQUIRED'`
 * se revalida server-side en la propia escritura (no en un SELECT previo).
 */

export const manualRefundSchema = z.object({
  orderId: z.string().uuid("orderId debe ser un UUID"),
  providerRefundId: z.string().trim().min(3).max(200),
  comment: z
    .string()
    .trim()
    .min(10, "Contá qué pasó y cómo se resolvió (mínimo 10 caracteres)")
    .max(2000),
});

export type ManualRefundInput = z.infer<typeof manualRefundSchema>;

export interface AdminRefundRow {
  id: string;
  orderId: string;
  orderNumber: string;
  email: string;
  provider: string;
  status: string;
  reason: string;
  amountCop: number | null;
  currency: string;
  attemptCount: number;
  errorMessage: string | null;
  requestedAt: Date;
  initiatedAt: Date | null;
  completedAt: Date | null;
}

interface RefundQueryRow {
  id: string;
  order_id: string;
  order_number: string;
  email: string;
  provider: string;
  status: string;
  reason: string;
  amount_cop: number | null;
  currency: string;
  attempt_count: number;
  error_message: string | null;
  requested_at: string;
  initiated_at: string | null;
  completed_at: string | null;
}

function toAdminRefundRow(row: RefundQueryRow): AdminRefundRow {
  return {
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    email: row.email,
    provider: row.provider,
    status: row.status,
    reason: row.reason,
    amountCop: row.amount_cop === null ? null : Number(row.amount_cop),
    currency: row.currency,
    attemptCount: row.attempt_count,
    errorMessage: row.error_message,
    requestedAt: new Date(row.requested_at),
    initiatedAt: row.initiated_at ? new Date(row.initiated_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  };
}

export async function listRefundsAdmin(db: Db, status?: string): Promise<AdminRefundRow[]> {
  const filter = status ? sql`WHERE rr.status = ${status}` : sql``;
  const { rows } = (await db.execute(sql`
    SELECT rr.id, rr.order_id, o.order_number, o.email, rr.provider, rr.status, rr.reason,
           rr.amount_cop, rr.currency, rr.attempt_count, rr.error_message,
           rr.requested_at, rr.initiated_at, rr.completed_at
      FROM refund_requests rr
      JOIN orders o ON o.id = rr.order_id
      ${filter}
     ORDER BY
       CASE rr.status WHEN 'MANUAL_REVIEW_REQUIRED' THEN 0 ELSE 1 END,
       rr.requested_at DESC
     LIMIT 200
  `)) as unknown as { rows: RefundQueryRow[] };

  return rows.map(toAdminRefundRow);
}

export async function getRefundAdmin(db: Db, refundId: string): Promise<AdminRefundRow | null> {
  const { rows } = (await db.execute(sql`
    SELECT rr.id, rr.order_id, o.order_number, o.email, rr.provider, rr.status, rr.reason,
           rr.amount_cop, rr.currency, rr.attempt_count, rr.error_message,
           rr.requested_at, rr.initiated_at, rr.completed_at
      FROM refund_requests rr
      JOIN orders o ON o.id = rr.order_id
     WHERE rr.id = ${refundId}::uuid
  `)) as unknown as { rows: RefundQueryRow[] };

  const row = rows[0];
  return row ? toAdminRefundRow(row) : null;
}

/**
 * Confirma un reembolso manual REAL — ya ejecutado por el admin fuera del
 * sistema. Flujo completo:
 *  1. Revalida `status = 'MANUAL_REVIEW_REQUIRED'` en la propia UPDATE
 *     (nunca en un SELECT previo — misma disciplina que el resto del
 *     sistema contra condiciones de carrera).
 *  2. Verifica que `orderId` corresponde de verdad a este `refund_request`
 *     (protección contra un id pegado mal).
 *  3. Marca la orden como REFUNDED.
 *  4. Audita con TODO el detalle: quién, cuándo, proveedor, referencia del
 *     proveedor, importe, moneda, comentario, refund_request y order
 *     afectados.
 *  5. Avisa al cliente por email (mismo texto que usa el worker automático
 *     cuando sí puede completar solo).
 */
export async function executeManualRefund(
  pool: Pool,
  actor: ValidatedSession,
  refundRequestId: string,
  input: ManualRefundInput,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const orderInfo = await withTransaction(pool, async (tx) => {
    const { rows: existingRows } = (await tx.execute(
      sql`SELECT order_id, status, provider, amount_cop, currency FROM refund_requests WHERE id = ${refundRequestId}::uuid FOR UPDATE`,
    )) as unknown as {
      rows: Array<{ order_id: string; status: string; provider: string; amount_cop: number | null; currency: string }>;
    };
    const existing = existingRows[0];
    if (!existing) throw new RefundRequestNotFoundError(refundRequestId);
    if (existing.status !== "MANUAL_REVIEW_REQUIRED") {
      throw new RefundNotPendingManualReviewError(refundRequestId, existing.status);
    }
    if (existing.order_id !== input.orderId) throw new RefundOrderMismatchError();

    await tx.execute(sql`
      UPDATE refund_requests
         SET status = 'REFUND_COMPLETED', provider_ref = ${input.providerRefundId},
             error_message = NULL, completed_at = now()
       WHERE id = ${refundRequestId}::uuid AND status = 'MANUAL_REVIEW_REQUIRED'
    `);

    await tx.execute(
      sql`UPDATE orders SET payment_status = 'REFUNDED', updated_at = now() WHERE id = ${input.orderId}::uuid`,
    );

    await writeAudit(tx, {
      actorType: actor.role,
      actorId: actor.userId,
      action: "refund.manual_completed",
      entityType: "refund_request",
      entityId: refundRequestId,
      metadata: {
        orderId: input.orderId,
        provider: existing.provider,
        providerRefundId: input.providerRefundId,
        amountCop: existing.amount_cop === null ? null : Number(existing.amount_cop),
        currency: existing.currency,
        comment: input.comment,
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    const { rows: orderRows } = (await tx.execute(
      sql`SELECT order_number, email FROM orders WHERE id = ${input.orderId}::uuid`,
    )) as unknown as { rows: Array<{ order_number: string; email: string }> };
    return orderRows[0];
  });

  if (orderInfo) {
    await sendMail({
      to: orderInfo.email,
      subject: "Reembolso procesado — Loadout",
      text: refundCompletedEmail(orderInfo.order_number),
    });
  }
}

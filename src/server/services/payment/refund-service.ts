import "server-only";

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { createDb, withTransaction, type Db, type TxDb } from "../../db/client";
import { writeAudit } from "../audit";
import { voidWompiTransaction } from "./wompi-client";
import { refundPaypalCapture } from "./paypal-client";
import { paymentManualReviewEmail, refundCompletedEmail, sendMail } from "../mailer";

/**
 * Cola de reembolso asíncrono y el worker que la vacía.
 *
 * Decisión aprobada: el reembolso NUNCA se ejecuta dentro de la transacción
 * del webhook — nace acá como una fila en `PENDING_REFUND` y un worker
 * aparte (`npm run db:refund-worker`, corrido cada ~10s por cron/scheduler)
 * la procesa. `claimNextRefundRequest` usa `FOR UPDATE SKIP LOCKED` para que
 * correr varias instancias del worker a la vez sea seguro: cada una se lleva
 * una fila distinta, ninguna espera a la otra.
 *
 * Reintentos: máximo `MAX_REFUND_ATTEMPTS` (10), separados por
 * `REFUND_RETRY_INTERVAL_MINUTES` (5) — sin columna extra para eso: una
 * fila que falló se queda en `REFUND_INITIATED` con su `initiated_at`
 * viejo, y `claimNextRefundRequest` la vuelve a tomar en cuanto pasan esos
 * 5 minutos. Agotados los 10 intentos, cae a `MANUAL_REVIEW_REQUIRED`.
 */

const MAX_REFUND_ATTEMPTS = 10;
const REFUND_RETRY_INTERVAL_MINUTES = 5;
/** Wompi solo permite VOID dentro de esta ventana — pasada, no hay refund API que llamar (ver wompi-client.ts). */
const WOMPI_VOID_WINDOW_HOURS = 2;

interface ExecResult {
  rows: Record<string, unknown>[];
  rowCount: number | null;
}

async function run(db: Db | TxDb, query: ReturnType<typeof sql>): Promise<ExecResult> {
  const result = (await db.execute(query)) as unknown as ExecResult;
  return { rows: result.rows ?? [], rowCount: result.rowCount ?? null };
}

/* ────────────────────────── creación ────────────────────────── */

export interface CreateRefundRequestParams {
  orderId: string;
  paymentIntentId: string;
  provider: "WOMPI" | "PAYPAL";
  amountCop: number;
  amountUsd: number | null;
  currency: string;
}

/**
 * `providerRequestId` se genera y se guarda ACÁ, antes de que exista
 * cualquier intento de llamar a Wompi/PayPal — es la barrera real contra el
 * doble reembolso (condición explícita del pedido), no la ventana de
 * idempotencia que cada proveedor pueda o no recordar de su lado.
 */
export async function createRefundRequest(pool: Pool, params: CreateRefundRequestParams): Promise<string> {
  const db = createDb(pool);
  const providerRequestId = randomUUID();

  const { rows } = await run(
    db,
    sql`
      INSERT INTO refund_requests (order_id, payment_intent_id, provider, provider_request_id, amount_cop, amount_usd, currency)
      VALUES (${params.orderId}::uuid, ${params.paymentIntentId}::uuid, ${params.provider}, ${providerRequestId}, ${params.amountCop}, ${params.amountUsd}, ${params.currency})
      RETURNING id
    `,
  );
  const id = String(rows[0].id);

  await writeAudit(db, {
    actorType: "SYSTEM",
    action: "refund.requested",
    entityType: "refund_request",
    entityId: id,
    metadata: { orderId: params.orderId, paymentIntentId: params.paymentIntentId, provider: params.provider },
  });

  return id;
}

/* ────────────────────────── claim (concurrencia) ────────────────────────── */

export interface ClaimedRefund {
  id: string;
  orderId: string;
  paymentIntentId: string;
  provider: "WOMPI" | "PAYPAL";
  providerRequestId: string;
  attemptCount: number;
  amountCop: number;
  amountUsd: number | null;
  currency: string;
}

/**
 * Toma UNA fila lista para procesar, o `null` si no hay ninguna. La
 * transacción que hace el `SELECT ... FOR UPDATE SKIP LOCKED` + `UPDATE`
 * se cierra antes de llamar a ningún proveedor — el lock de fila dura lo
 * mínimo, nunca lo que tarda una llamada de red.
 */
export async function claimNextRefundRequest(pool: Pool): Promise<ClaimedRefund | null> {
  return withTransaction(pool, async (tx) => {
    const { rows: candidates } = await run(
      tx,
      sql`
        SELECT id FROM refund_requests
         WHERE status = 'PENDING_REFUND'
            OR (status = 'REFUND_INITIATED'
                AND initiated_at < now() - make_interval(secs => ${REFUND_RETRY_INTERVAL_MINUTES * 60}::double precision))
         ORDER BY requested_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      `,
    );
    if (candidates.length === 0) return null;

    const { rows: updated } = await run(
      tx,
      sql`
        UPDATE refund_requests
           SET status = 'REFUND_INITIATED', initiated_at = now(), attempt_count = attempt_count + 1
         WHERE id = ${candidates[0].id}::uuid
        RETURNING id, order_id, payment_intent_id, provider, provider_request_id, attempt_count, amount_cop, amount_usd, currency
      `,
    );
    const row = updated[0];
    return {
      id: String(row.id),
      orderId: String(row.order_id),
      paymentIntentId: String(row.payment_intent_id),
      provider: row.provider as "WOMPI" | "PAYPAL",
      providerRequestId: String(row.provider_request_id),
      attemptCount: Number(row.attempt_count),
      amountCop: Number(row.amount_cop),
      amountUsd: row.amount_usd === null ? null : Number(row.amount_usd),
      currency: String(row.currency),
    };
  });
}

/* ────────────────────────── procesamiento ────────────────────────── */

async function fetchOrderNumberAndEmail(pool: Pool, orderId: string): Promise<{ orderNumber: string; email: string } | undefined> {
  const db = createDb(pool);
  const { rows } = await run(db, sql`SELECT order_number, email FROM orders WHERE id = ${orderId}::uuid`);
  const row = rows[0];
  if (!row) return undefined;
  return { orderNumber: String(row.order_number), email: String(row.email) };
}

async function markCompleted(pool: Pool, claimed: ClaimedRefund, providerRefundId: string, response: unknown): Promise<void> {
  await withTransaction(pool, async (tx) => {
    await run(
      tx,
      sql`
        UPDATE refund_requests
           SET status = 'REFUND_COMPLETED', provider_ref = ${providerRefundId},
               provider_response = ${JSON.stringify(response)}::jsonb, completed_at = now()
         WHERE id = ${claimed.id}::uuid
      `,
    );
    await run(
      tx,
      sql`UPDATE orders SET payment_status = 'REFUNDED', updated_at = now() WHERE id = ${claimed.orderId}::uuid`,
    );
    await writeAudit(tx, {
      actorType: "SYSTEM",
      action: "refund.completed",
      entityType: "refund_request",
      entityId: claimed.id,
      metadata: { orderId: claimed.orderId, provider: claimed.provider },
    });
  });

  const order = await fetchOrderNumberAndEmail(pool, claimed.orderId);
  if (order) {
    await sendMail({
      to: order.email,
      subject: "Reembolso procesado — Loadout",
      text: refundCompletedEmail(order.orderNumber),
    });
  }
}

async function markManualReview(pool: Pool, claimed: ClaimedRefund, reason: string): Promise<void> {
  const db = createDb(pool);
  await run(
    db,
    sql`UPDATE refund_requests SET status = 'MANUAL_REVIEW_REQUIRED', error_message = ${reason} WHERE id = ${claimed.id}::uuid`,
  );
  await writeAudit(db, {
    actorType: "SYSTEM",
    action: "refund.manual_review",
    entityType: "refund_request",
    entityId: claimed.id,
    metadata: { orderId: claimed.orderId, reason },
  });

  const order = await fetchOrderNumberAndEmail(pool, claimed.orderId);
  if (order) {
    await sendMail({
      to: order.email,
      subject: "Sobre tu pedido — Loadout",
      text: paymentManualReviewEmail(order.orderNumber),
    });
  }
}

/** Error transient (timeout, 5xx, red): NO se marca terminal — se deja para el próximo reintento. */
async function handleRefundAttemptFailure(pool: Pool, claimed: ClaimedRefund, error: unknown): Promise<void> {
  const db = createDb(pool);
  const message = error instanceof Error ? error.message : String(error);
  await run(db, sql`UPDATE refund_requests SET error_message = ${message} WHERE id = ${claimed.id}::uuid`);
  await writeAudit(db, {
    actorType: "SYSTEM",
    action: "refund.failed",
    entityType: "refund_request",
    entityId: claimed.id,
    metadata: { orderId: claimed.orderId, attempt: claimed.attemptCount, error: message },
  });
  // Sin más acción: la fila sigue en REFUND_INITIATED con `initiated_at`
  // viejo, y `claimNextRefundRequest` la vuelve a tomar pasados los 5
  // minutos de reintento — no un UPDATE separado para "programarla".
}

async function processWompiRefund(pool: Pool, claimed: ClaimedRefund): Promise<void> {
  const db = createDb(pool);
  const { rows } = await run(
    db,
    sql`SELECT provider_ref, created_at FROM payment_intents WHERE id = ${claimed.paymentIntentId}::uuid`,
  );
  const providerRef = rows[0]?.provider_ref as string | undefined;
  const createdAt = rows[0]?.created_at ? new Date(String(rows[0].created_at)) : undefined;

  if (!providerRef) {
    await markManualReview(pool, claimed, "payment_intent sin provider_ref de Wompi");
    return;
  }

  const withinVoidWindow =
    createdAt !== undefined && Date.now() - createdAt.getTime() < WOMPI_VOID_WINDOW_HOURS * 3_600_000;

  if (!withinVoidWindow) {
    // No inventar una API de refund que Wompi no ofrece: fuera de la
    // ventana de void, el único camino es soporte manual.
    await markManualReview(
      pool,
      claimed,
      "Transacción fuera de la ventana de void de Wompi (no hay refund API post-captura)",
    );
    return;
  }

  const response = await voidWompiTransaction(providerRef, claimed.providerRequestId);
  if (response.data.status === "VOIDED") {
    await markCompleted(pool, claimed, response.data.id, response);
  } else {
    await markManualReview(pool, claimed, `Wompi no confirmó el void (status: ${response.data.status})`);
  }
}

async function processPaypalRefund(pool: Pool, claimed: ClaimedRefund): Promise<void> {
  const db = createDb(pool);
  const { rows } = await run(
    db,
    sql`SELECT provider_ref FROM payment_intents WHERE id = ${claimed.paymentIntentId}::uuid`,
  );
  const captureId = rows[0]?.provider_ref as string | undefined;

  if (!captureId) {
    await markManualReview(pool, claimed, "payment_intent sin provider_ref (capture id) de PayPal");
    return;
  }

  const response = await refundPaypalCapture(captureId, claimed.providerRequestId);
  if (response.status === "COMPLETED") {
    await markCompleted(pool, claimed, response.id, response);
  }
  // PENDING u otro estado no terminal: se deja en REFUND_INITIATED. El
  // reintento (mismo `providerRequestId`) es idempotente del lado de
  // PayPal — devuelve el mismo refund, y cuando ya esté COMPLETED se marca
  // acá. El webhook `PAYMENT.CAPTURE.REFUNDED` deja además su propio rastro
  // en `webhook_received_at` (`markRefundWebhookReceived`).
}

export async function processClaimedRefund(pool: Pool, claimed: ClaimedRefund): Promise<void> {
  if (claimed.attemptCount > MAX_REFUND_ATTEMPTS) {
    await markManualReview(pool, claimed, "Se alcanzó el máximo de reintentos automáticos");
    return;
  }

  try {
    if (claimed.provider === "WOMPI") {
      await processWompiRefund(pool, claimed);
    } else {
      await processPaypalRefund(pool, claimed);
    }
  } catch (error) {
    await handleRefundAttemptFailure(pool, claimed, error);
  }
}

/* ────────────────────────── worker ────────────────────────── */

/**
 * Un lote del worker: procesa hasta `maxItems` reembolsos pendientes y
 * corta en cuanto no queda ninguno. Pensado para correr cada ~10 segundos
 * (cron/scheduler externo) — `npm run db:refund-worker` es el punto de
 * entrada, igual que `npm run db:sweep` para las reservas vencidas.
 */
export async function runRefundWorkerBatch(pool: Pool, maxItems = 20): Promise<{ processed: number }> {
  let processed = 0;
  for (let i = 0; i < maxItems; i += 1) {
    const claimed = await claimNextRefundRequest(pool);
    if (!claimed) break;
    await processClaimedRefund(pool, claimed);
    processed += 1;
  }
  return { processed };
}

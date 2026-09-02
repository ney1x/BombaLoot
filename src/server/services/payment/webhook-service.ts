import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { createDb, withTransaction, type Db, type TxDb } from "../../db/client";
import { writeAudit } from "../audit";
import {
  extractWompiTransaction,
  getWompiTransactionByReference,
  verifyWompiWebhookSignature,
  type WompiEventPayload,
} from "./wompi-client";
import {
  getPaypalOrder,
  verifyPaypalWebhookSignature,
  type PaypalCapture,
  type PaypalOrderResponse,
  type PaypalWebhookHeaders,
} from "./paypal-client";
import { WebhookAmountMismatchError, WebhookCurrencyMismatchError } from "./errors";
import { createRefundRequest } from "./refund-service";
import { paymentUnavailableEmail, sendMail } from "../mailer";

/**
 * El estado del mundo de pagos, en un solo lugar: acá se decide qué
 * significa "aprobado" o "rechazado" para `orders`/`codes`/`refund_requests`,
 * sea que el disparador sea un webhook (Wompi/PayPal) o una sincronización
 * manual (`GET /api/result` cuando el webhook nunca llegó — ver
 * `syncPaymentIntentWithProvider`). Los clientes de Wompi/PayPal solo hacen
 * transporte; toda la máquina de estados vive acá.
 */

interface ExecResult {
  rows: Record<string, unknown>[];
  rowCount: number | null;
}

async function run(db: Db | TxDb, query: ReturnType<typeof sql>): Promise<ExecResult> {
  const result = (await db.execute(query)) as unknown as ExecResult;
  return { rows: result.rows ?? [], rowCount: result.rowCount ?? null };
}

/* ────────────────────────── registro de eventos (payment_events) ────────────────────────── */

interface RecordEventParams {
  provider: "WOMPI" | "PAYPAL";
  eventId: string;
  eventType: string;
  signatureValid: boolean;
  payload: unknown;
  paymentIntentId?: string;
}

/**
 * INSERT con `UNIQUE(provider, event_id)` — la barrera real contra webhooks
 * duplicados/reenviados. `inserted: false` significa "ya lo vimos", y el
 * llamador responde 200 sin reprocesar nada (Caso D del diseño).
 */
async function recordWebhookEvent(
  pool: Pool,
  params: RecordEventParams,
): Promise<{ id: number; inserted: boolean }> {
  const db = createDb(pool);
  try {
    const { rows } = await run(
      db,
      sql`
        INSERT INTO payment_events (payment_intent_id, provider, event_id, event_type, status, signature_valid, payload)
        VALUES (${params.paymentIntentId ?? null}::uuid, ${params.provider}, ${params.eventId}, ${params.eventType}, 'RECEIVED', ${params.signatureValid}, ${JSON.stringify(params.payload)}::jsonb)
        RETURNING id
      `,
    );
    return { id: Number(rows[0].id), inserted: true };
  } catch (error) {
    if (isDuplicateEvent(error)) {
      const { rows } = await run(
        db,
        sql`SELECT id FROM payment_events WHERE provider = ${params.provider} AND event_id = ${params.eventId}`,
      );
      return { id: Number(rows[0]?.id ?? 0), inserted: false };
    }
    throw error;
  }
}

function isDuplicateEvent(error: unknown): boolean {
  const withPgFields = (c: unknown): c is { code?: string; constraint?: string } =>
    typeof c === "object" && c !== null;
  for (const candidate of [error, (error as { cause?: unknown } | undefined)?.cause]) {
    if (withPgFields(candidate) && candidate.code === "23505" && candidate.constraint?.includes("payment_events_provider_event")) {
      return true;
    }
  }
  return false;
}

async function markEventStatus(
  pool: Pool,
  eventId: number,
  status: "PROCESSED" | "REJECTED" | "ERROR",
  errorMessage: string | null,
  paymentIntentId?: string,
): Promise<void> {
  const db = createDb(pool);
  await run(
    db,
    sql`
      UPDATE payment_events
         SET status = ${status}, error_message = ${errorMessage}, processed_at = now(),
             payment_intent_id = COALESCE(payment_intent_id, ${paymentIntentId ?? null}::uuid)
       WHERE id = ${eventId}
    `,
  );
}

/* ────────────────────────── resolución de intents ────────────────────────── */

interface IntentRow {
  id: string;
  order_id: string;
  status: string;
  amount_cop: number;
  amount_usd: string | null;
  currency: string;
}

async function findIntentByReference(
  pool: Pool,
  reference: string,
  provider: "WOMPI" | "PAYPAL",
): Promise<IntentRow | undefined> {
  const db = createDb(pool);
  const byId = await run(
    db,
    sql`
      SELECT id, order_id, status, amount_cop, amount_usd, currency FROM payment_intents
       WHERE id = ${reference}::uuid AND provider = ${provider}
    `,
  );
  if (byId.rows[0]) return byId.rows[0] as unknown as IntentRow;

  const byRef = await run(
    db,
    sql`
      SELECT id, order_id, status, amount_cop, amount_usd, currency FROM payment_intents
       WHERE provider_ref = ${reference} AND provider = ${provider}
    `,
  );
  return byRef.rows[0] as unknown as IntentRow | undefined;
}

/* ────────────────────────── aplicar el resultado del pago ────────────────────────── */

export interface ApprovedPaymentDetails {
  paymentIntentId: string;
  providerRef: string;
  /** En la unidad canónica de `currency`: COP entero, o USD con decimales. */
  amountReceived: number;
  currency: "COP" | "USD";
  paymentMethod?: string;
  payerEmail?: string;
  rawPayload: unknown;
}

export interface ApplyPaymentResult {
  /** false si el intent ya estaba en un estado terminal — no-op idempotente. */
  applied: boolean;
  /** true si había códigos y se entregaron al pedido; false si se creó un refund_request. */
  delivered: boolean;
}

/**
 * Núcleo del Caso A y del Caso B/G del diseño. Llamado tanto por los
 * webhooks como por `capturePaypalPayment` (la captura síncrona de PayPal)
 * y por `syncPaymentIntentWithProvider` — siempre el mismo camino, nunca
 * tres implementaciones distintas de "qué pasa cuando un pago se aprueba".
 */
export async function applyApprovedPayment(pool: Pool, details: ApprovedPaymentDetails): Promise<ApplyPaymentResult> {
  const result = await withTransaction(pool, async (tx) => {
    const { rows: intentRows } = await run(
      tx,
      sql`
        SELECT id, order_id, status, amount_cop, amount_usd, currency FROM payment_intents
         WHERE id = ${details.paymentIntentId}::uuid
         FOR UPDATE
      `,
    );
    const intent = intentRows[0] as unknown as IntentRow | undefined;
    if (!intent) return { applied: false, delivered: false, orderId: null as string | null };

    // Terminal ya resuelto: no-op idempotente. Cubre tanto el reintento
    // legítimo (mismo evento, distinto payment_events.id por lo que sea)
    // como un evento fuera de orden que llegara después de uno más nuevo
    // — un intent nunca "retrocede" desde un estado terminal.
    if (intent.status === "APPROVED" || intent.status === "FAILED" || intent.status === "REFUNDED") {
      return { applied: false, delivered: false, orderId: intent.order_id };
    }

    if (details.currency !== intent.currency) {
      throw new WebhookCurrencyMismatchError(intent.currency, details.currency);
    }
    const expected = details.currency === "COP" ? intent.amount_cop : Number(intent.amount_usd);
    const tolerance = details.currency === "COP" ? 1 : 0.01;
    if (Math.abs(details.amountReceived - expected) > tolerance) {
      throw new WebhookAmountMismatchError(expected, details.amountReceived);
    }

    await run(
      tx,
      sql`
        UPDATE payment_intents
           SET status = 'APPROVED', provider_ref = ${details.providerRef},
               raw_payload = ${JSON.stringify(details.rawPayload)}::jsonb, updated_at = now()
         WHERE id = ${intent.id}::uuid
      `,
    );

    // ¿Siguen los códigos asignados a este pedido? `attachCodesToOrderItem`
    // (fase 4) ya los movió al puntero permanente en el checkout; acá solo
    // se confirma que el barrido de reservas vencidas no los haya liberado
    // mientras tanto (Caso G: pago tardío).
    const { rows: codeRows } = await run(
      tx,
      sql`
        SELECT c.id FROM codes c
          JOIN order_items oi ON oi.id = c.order_item_id
         WHERE oi.order_id = ${intent.order_id}::uuid AND c.status = 'RESERVED'
         FOR UPDATE
      `,
    );

    if (codeRows.length === 0) {
      await run(
        tx,
        sql`
          UPDATE orders
             SET payment_status = 'PAID', delivery_status = 'UNAVAILABLE',
                 payment_method = ${details.paymentMethod ?? null},
                 payer_email = ${details.payerEmail ?? null},
                 paid_at = now(), updated_at = now()
           WHERE id = ${intent.order_id}::uuid
        `,
      );
      await writeAudit(tx, {
        actorType: "SYSTEM",
        action: "order.paid_unavailable",
        entityType: "order",
        entityId: intent.order_id,
        metadata: { paymentIntentId: intent.id },
      });
      return { applied: true, delivered: false, orderId: intent.order_id };
    }

    const codeIds = codeRows.map((r) => String(r.id));
    await run(
      tx,
      sql`
        UPDATE codes SET status = 'PAID', reserved_until = NULL
         WHERE id IN (${sql.join(codeIds.map((id) => sql`${id}::uuid`), sql`, `)})
      `,
    );
    await run(
      tx,
      sql`
        UPDATE orders
           SET payment_status = 'PAID', delivery_status = 'PENDING',
               payment_method = ${details.paymentMethod ?? null},
               payer_email = ${details.payerEmail ?? null},
               paid_at = now(), updated_at = now()
         WHERE id = ${intent.order_id}::uuid
      `,
    );
    await writeAudit(tx, {
      actorType: "SYSTEM",
      action: "order.paid",
      entityType: "order",
      entityId: intent.order_id,
      metadata: { paymentIntentId: intent.id, codesPaid: codeIds.length },
    });
    return { applied: true, delivered: true, orderId: intent.order_id };
  });

  // El refund_request y el mail se crean FUERA de la transacción del
  // webhook a propósito (decisión aprobada): un timeout llamando a
  // Wompi/PayPal para el reembolso nunca debe poder hacer fallar (y
  // reintentar entero) el registro del pago mismo.
  if (result.applied && !result.delivered && result.orderId) {
    const order = await fetchOrderForRefund(pool, result.orderId);
    if (order) {
      await createRefundRequest(pool, {
        orderId: order.id,
        paymentIntentId: details.paymentIntentId,
        provider: order.provider,
        amountCop: order.amountCop,
        amountUsd: order.amountUsd,
        currency: order.currency,
      });
      await sendMail({
        to: order.email,
        subject: "Sobre tu pedido — bombaloot",
        text: paymentUnavailableEmail(order.orderNumber),
      });
    }
  }

  return { applied: result.applied, delivered: result.delivered };
}

async function fetchOrderForRefund(
  pool: Pool,
  orderId: string,
): Promise<
  | { id: string; orderNumber: string; email: string; provider: "WOMPI" | "PAYPAL"; amountCop: number; amountUsd: number | null; currency: string }
  | undefined
> {
  const db = createDb(pool);
  const { rows } = await run(
    db,
    sql`
      SELECT o.id, o.order_number, o.email, pi.provider, pi.amount_cop, pi.amount_usd, pi.currency
        FROM orders o
        JOIN payment_intents pi ON pi.order_id = o.id AND pi.status = 'APPROVED'
       WHERE o.id = ${orderId}::uuid
       ORDER BY pi.created_at DESC
       LIMIT 1
    `,
  );
  const row = rows[0];
  if (!row) return undefined;
  return {
    id: String(row.id),
    orderNumber: String(row.order_number),
    email: String(row.email),
    provider: row.provider as "WOMPI" | "PAYPAL",
    amountCop: Number(row.amount_cop),
    amountUsd: row.amount_usd === null ? null : Number(row.amount_usd),
    currency: String(row.currency),
  };
}

/** Rechazo/cancelación del proveedor. Mismo guard de "no retroceder desde terminal" que arriba. */
export async function applyFailedPayment(pool: Pool, paymentIntentId: string, providerStatus: string): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const { rows } = await run(
      tx,
      sql`SELECT id, order_id, status FROM payment_intents WHERE id = ${paymentIntentId}::uuid FOR UPDATE`,
    );
    const intent = rows[0];
    if (!intent || (intent.status !== "PENDING" && intent.status !== "INITIATED")) return;

    await run(
      tx,
      sql`UPDATE payment_intents SET status = 'FAILED', updated_at = now() WHERE id = ${paymentIntentId}::uuid`,
    );
    await run(
      tx,
      sql`
        UPDATE orders SET payment_status = 'FAILED', last_payment_error = ${providerStatus}, updated_at = now()
         WHERE id = ${intent.order_id}::uuid AND payment_status = 'PENDING'
      `,
    );
    // Libera los códigos que el checkout había asignado a este pedido —
    // mismo criterio que `sweepExpiredPendingOrders` (fase 4).
    await run(
      tx,
      sql`
        UPDATE codes c
           SET status = 'AVAILABLE', reservation_id = NULL, reserved_until = NULL, order_item_id = NULL
          FROM order_items oi
         WHERE c.order_item_id = oi.id AND oi.order_id = ${intent.order_id}::uuid AND c.status = 'RESERVED'
      `,
    );
    await writeAudit(tx, {
      actorType: "SYSTEM",
      action: "order.failed",
      entityType: "order",
      entityId: String(intent.order_id),
      metadata: { paymentIntentId, reason: providerStatus },
    });
  });
}

/* ────────────────────────── Wompi ────────────────────────── */

export interface WebhookResult {
  status: number;
  body: unknown;
}

export async function processWompiWebhook(pool: Pool, rawBody: string): Promise<WebhookResult> {
  let event: WompiEventPayload;
  try {
    event = JSON.parse(rawBody) as WompiEventPayload;
  } catch {
    return { status: 400, body: { error: "JSON inválido" } };
  }

  const tx = extractWompiTransaction(event);
  const eventId = tx?.id ?? `unsigned-${event.timestamp ?? Date.now()}`;

  let signatureValid = false;
  try {
    signatureValid = verifyWompiWebhookSignature(event);
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    await recordWebhookEvent(pool, {
      provider: "WOMPI",
      eventId,
      eventType: event.event ?? "unknown",
      signatureValid: false,
      payload: event,
    });
    return { status: 401, body: { error: "Firma inválida" } };
  }

  if (!tx) {
    await recordWebhookEvent(pool, {
      provider: "WOMPI",
      eventId,
      eventType: event.event ?? "unknown",
      signatureValid: true,
      payload: event,
    });
    return { status: 400, body: { error: "Payload sin transacción" } };
  }

  const recorded = await recordWebhookEvent(pool, {
    provider: "WOMPI",
    eventId: tx.id,
    eventType: event.event ?? "unknown",
    signatureValid: true,
    payload: event,
  });
  if (!recorded.inserted) {
    return { status: 200, body: { duplicate: true } };
  }

  const intent = await findIntentByReference(pool, tx.reference, "WOMPI");
  if (!intent) {
    await markEventStatus(pool, recorded.id, "REJECTED", `reference sin payment_intent: ${tx.reference}`);
    return { status: 404, body: { error: "orden no encontrada" } };
  }

  try {
    if (tx.status === "APPROVED") {
      await applyApprovedPayment(pool, {
        paymentIntentId: intent.id,
        providerRef: tx.id,
        amountReceived: tx.amount_in_cents / 100,
        currency: "COP",
        paymentMethod: tx.payment_method_type,
        payerEmail: tx.customer_email,
        rawPayload: event,
      });
    } else if (tx.status === "DECLINED" || tx.status === "VOIDED" || tx.status === "ERROR") {
      await applyFailedPayment(pool, intent.id, tx.status);
    }
    await markEventStatus(pool, recorded.id, "PROCESSED", null, intent.id);
  } catch (error) {
    await markEventStatus(pool, recorded.id, "ERROR", (error as Error).message, intent.id);
    throw error;
  }

  return { status: 200, body: { ok: true } };
}

/* ────────────────────────── PayPal ────────────────────────── */

function extractPaypalCapture(order: PaypalOrderResponse): PaypalCapture | undefined {
  return order.purchase_units?.[0]?.payments?.captures?.[0];
}

export async function processPaypalWebhook(
  pool: Pool,
  rawBody: string,
  headers: PaypalWebhookHeaders,
): Promise<WebhookResult> {
  let event: {
    id: string;
    event_type: string;
    resource: PaypalOrderResponse & { supplementary_data?: { related_ids?: { order_id?: string } } };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "JSON inválido" } };
  }

  const signatureValid = await verifyPaypalWebhookSignature(headers, event).catch(() => false);

  if (!signatureValid) {
    await recordWebhookEvent(pool, {
      provider: "PAYPAL",
      eventId: event.id ?? `unsigned-${Date.now()}`,
      eventType: event.event_type ?? "unknown",
      signatureValid: false,
      payload: event,
    });
    return { status: 401, body: { error: "Firma inválida" } };
  }

  const recorded = await recordWebhookEvent(pool, {
    provider: "PAYPAL",
    eventId: event.id,
    eventType: event.event_type,
    signatureValid: true,
    payload: event,
  });
  if (!recorded.inserted) {
    return { status: 200, body: { duplicate: true } };
  }

  const referenceId =
    event.resource.purchase_units?.[0]?.reference_id ?? event.resource.supplementary_data?.related_ids?.order_id;
  const paypalOrderId = event.resource.id ?? event.resource.supplementary_data?.related_ids?.order_id;

  const intent =
    (referenceId && (await findIntentByReference(pool, referenceId, "PAYPAL"))) ??
    (paypalOrderId ? await findIntentByReference(pool, paypalOrderId, "PAYPAL") : undefined);

  if (!intent) {
    await markEventStatus(pool, recorded.id, "REJECTED", `referencia sin payment_intent: ${referenceId ?? paypalOrderId}`);
    return { status: 404, body: { error: "orden no encontrada" } };
  }

  try {
    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED" || event.event_type === "CHECKOUT.ORDER.COMPLETED") {
      const capture = extractPaypalCapture(event.resource);
      await applyApprovedPayment(pool, {
        paymentIntentId: intent.id,
        providerRef: capture?.id ?? String(paypalOrderId),
        amountReceived: Number(capture?.amount?.value ?? event.resource.purchase_units?.[0]?.amount?.value ?? 0),
        currency: "USD",
        rawPayload: event,
      });
    } else if (event.event_type === "PAYMENT.CAPTURE.DENIED" || event.event_type === "CHECKOUT.ORDER.VOIDED") {
      await applyFailedPayment(pool, intent.id, event.event_type);
    } else if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
      await markRefundWebhookReceived(pool, intent.id);
    }
    await markEventStatus(pool, recorded.id, "PROCESSED", null, intent.id);
  } catch (error) {
    await markEventStatus(pool, recorded.id, "ERROR", (error as Error).message, intent.id);
    throw error;
  }

  return { status: 200, body: { ok: true } };
}

async function markRefundWebhookReceived(pool: Pool, paymentIntentId: string): Promise<void> {
  const db = createDb(pool);
  await run(
    db,
    sql`
      UPDATE refund_requests SET webhook_received_at = now()
       WHERE payment_intent_id = ${paymentIntentId}::uuid AND webhook_received_at IS NULL
    `,
  );
}

/* ────────────────────────── sincronización manual (webhook perdido) ────────────────────────── */

/**
 * Caso C del diseño: el `payment_intent` sigue INITIATED más de lo
 * razonable y el webhook nunca llegó (o se perdió). Se consulta al
 * proveedor directamente y, si dice aprobado, se aplica el mismo camino que
 * hubiera tomado el webhook — nunca una implementación paralela.
 */
export async function syncPaymentIntentWithProvider(
  pool: Pool,
  paymentIntentId: string,
): Promise<{ synced: boolean }> {
  const db = createDb(pool);
  const { rows } = await run(
    db,
    sql`
      SELECT id, order_id, provider, provider_ref, status
        FROM payment_intents WHERE id = ${paymentIntentId}::uuid
    `,
  );
  const intent = rows[0] as
    | { id: string; order_id: string; provider: "WOMPI" | "PAYPAL"; provider_ref: string | null; status: string }
    | undefined;
  if (!intent || intent.status !== "INITIATED") return { synced: false };

  if (intent.provider === "WOMPI") {
    const remote = await getWompiTransactionByReference(intent.id).catch(() => undefined);
    if (!remote) return { synced: false };
    if (remote.status === "APPROVED") {
      await applyApprovedPayment(pool, {
        paymentIntentId: intent.id,
        providerRef: remote.id,
        amountReceived: remote.amount_in_cents / 100,
        currency: "COP",
        paymentMethod: remote.payment_method_type,
        payerEmail: remote.customer_email,
        rawPayload: { manualSync: true, remote },
      });
      return { synced: true };
    }
    if (remote.status === "DECLINED" || remote.status === "VOIDED" || remote.status === "ERROR") {
      await applyFailedPayment(pool, intent.id, remote.status);
      return { synced: true };
    }
    return { synced: false };
  }

  if (!intent.provider_ref) return { synced: false };
  const remoteOrder = await getPaypalOrder(intent.provider_ref).catch(() => undefined);
  if (!remoteOrder) return { synced: false };
  const capture = extractPaypalCapture(remoteOrder);
  if (remoteOrder.status === "COMPLETED" || capture?.status === "COMPLETED") {
    await applyApprovedPayment(pool, {
      paymentIntentId: intent.id,
      providerRef: capture?.id ?? remoteOrder.id,
      amountReceived: Number(capture?.amount?.value ?? remoteOrder.purchase_units?.[0]?.amount?.value ?? 0),
      currency: "USD",
      rawPayload: { manualSync: true, remoteOrder },
    });
    return { synced: true };
  }
  if (remoteOrder.status === "VOIDED") {
    await applyFailedPayment(pool, intent.id, "VOIDED");
    return { synced: true };
  }
  return { synced: false };
}

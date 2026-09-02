import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { createDb } from "../../db/client";
import type { OrderView } from "../checkout-service";
import { writeAudit } from "../audit";
import { OrderNotFoundError, OrderNotPayableError } from "./errors";
import { loadOwnedOrder } from "./order-access";
import { buildWompiCheckoutUrl } from "./wompi-client";
import { createPaypalOrder, getPaypalOrder, capturePaypalOrder } from "./paypal-client";
import { applyApprovedPayment, applyFailedPayment } from "./webhook-service";

/**
 * Orquestación de "el cliente quiere pagar este pedido" — todo lo que pasa
 * ANTES del webhook: elegir proveedor, crear/reusar el `payment_intent`,
 * armar la URL o la orden del lado del proveedor.
 *
 * Ningún monto sale de acá sin pasar por el pedido en base: `order.totalCop`
 * es el canónico siempre — lo único que varía es a qué unidad se convierte
 * para el proveedor (centavos de COP para Wompi, USD con dos decimales
 * para PayPal).
 */

/**
 * Sin proveedor de tipo de cambio en vivo conectado (trade-off explícito,
 * pendiente de decisión de negocio): tasa fija por variable de entorno.
 * Antes de producción esto necesita una fuente real (Wompi/PayPal no dan
 * conversión COP↔USD por sí solos).
 */
const USD_COP_EXCHANGE_RATE_FALLBACK = 4000;

function usdExchangeRate(): number {
  const raw = process.env.USD_COP_EXCHANGE_RATE;
  const rate = raw ? Number(raw) : USD_COP_EXCHANGE_RATE_FALLBACK;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("USD_COP_EXCHANGE_RATE inválida");
  return rate;
}

export function copToUsd(amountCop: number): string {
  return (amountCop / usdExchangeRate()).toFixed(2);
}

function assertPayable(order: OrderView): void {
  if (order.paymentStatus !== "PENDING") {
    throw new OrderNotPayableError(order.orderId, order.paymentStatus);
  }
  if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() < Date.now()) {
    throw new OrderNotPayableError(order.orderId, "PAYMENT_EXPIRED");
  }
}

/* ────────────────────────── crear/reusar intent ────────────────────────── */

function isActiveIntentConflict(error: unknown): boolean {
  const withPgFields = (c: unknown): c is { code?: string; constraint?: string } =>
    typeof c === "object" && c !== null;
  for (const candidate of [error, (error as { cause?: unknown } | undefined)?.cause]) {
    if (withPgFields(candidate) && candidate.code === "23505" && candidate.constraint?.includes("active_per_order")) {
      return true;
    }
  }
  return false;
}

interface IntentRow {
  id: string;
  provider_ref: string | null;
  status: string;
}

/**
 * Un pedido puede tener varios `payment_intents` a lo largo del tiempo,
 * pero nunca dos activos (`PENDING`/`INITIATED`) a la vez —
 * `payment_intents_active_per_order_idx` (0004_payments.sql) es la barrera.
 * Un doble clic en "pagar" choca ahí, no acá: esto solo atrapa la
 * violación y devuelve el intento que ya está en curso.
 */
async function createOrReuseIntent(
  pool: Pool,
  params: { orderId: string; provider: "WOMPI" | "PAYPAL"; amountCop: number; amountUsd?: string; currency: string },
): Promise<{ intent: IntentRow; reused: boolean }> {
  const db = createDb(pool);
  try {
    const { rows } = (await db.execute(sql`
      INSERT INTO payment_intents (order_id, provider, status, amount_cop, amount_usd, currency)
      VALUES (${params.orderId}::uuid, ${params.provider}, 'PENDING', ${params.amountCop}, ${params.amountUsd ?? null}, ${params.currency})
      RETURNING id, provider_ref, status
    `)) as unknown as { rows: IntentRow[] };
    return { intent: rows[0], reused: false };
  } catch (error) {
    if (isActiveIntentConflict(error)) {
      const { rows } = (await db.execute(sql`
        SELECT id, provider_ref, status FROM payment_intents
         WHERE order_id = ${params.orderId}::uuid AND provider = ${params.provider}
           AND status IN ('PENDING', 'INITIATED')
         ORDER BY created_at DESC LIMIT 1
      `)) as unknown as { rows: IntentRow[] };
      if (rows[0]) return { intent: rows[0], reused: true };
    }
    throw error;
  }
}

async function markIntentInitiated(
  pool: Pool,
  intentId: string,
  params: { providerRef?: string; rawPayload: unknown },
): Promise<void> {
  const db = createDb(pool);
  await db.execute(sql`
    UPDATE payment_intents
       SET status = 'INITIATED', provider_ref = ${params.providerRef ?? null},
           raw_payload = ${JSON.stringify(params.rawPayload)}::jsonb, updated_at = now()
     WHERE id = ${intentId}::uuid
  `);
}

async function markIntentFailed(pool: Pool, intentId: string, errorMessage: string): Promise<void> {
  const db = createDb(pool);
  await db.execute(sql`
    UPDATE payment_intents
       SET status = 'FAILED', raw_payload = ${JSON.stringify({ error: errorMessage })}::jsonb, updated_at = now()
     WHERE id = ${intentId}::uuid
  `);
}

/* ────────────────────────── Wompi ────────────────────────── */

export interface InitWompiPaymentParams {
  orderId: string;
  accessToken?: string;
  userId?: string;
  /** Origen público del sitio (`https://bombaloot.co`, o el túnel/localhost de dev) — arma la `redirect_url`. */
  redirectBaseUrl: string;
}

export interface InitWompiPaymentResult {
  paymentIntentId: string;
  checkoutUrl: string;
  reused: boolean;
}

/**
 * El checkout alojado de Wompi no necesita una llamada de red para
 * "crear" la transacción — solo una URL firmada (ver
 * `wompi-client.ts#buildWompiCheckoutUrl`). El widget de Wompi es quien
 * crea la transacción real cuando el cliente completa el pago, con el
 * mismo `reference` que elegimos acá (`payment_intent.id`).
 */
export async function initWompiPayment(pool: Pool, params: InitWompiPaymentParams): Promise<InitWompiPaymentResult> {
  const order = await loadOwnedOrder(pool, params);
  assertPayable(order);

  const amountInCents = order.totalCop * 100;
  const { intent, reused } = await createOrReuseIntent(pool, {
    orderId: order.orderId,
    provider: "WOMPI",
    amountCop: order.totalCop,
    currency: "COP",
  });

  const checkoutUrl = buildWompiCheckoutUrl({
    reference: intent.id,
    amountInCents,
    currency: "COP",
    redirectUrl: `${params.redirectBaseUrl}/checkout/resultado/${intent.id}`,
    customerEmail: order.email,
  });

  if (intent.status === "PENDING") {
    await markIntentInitiated(pool, intent.id, { rawPayload: { checkoutUrl } });
    await writeAudit(createDb(pool), {
      actorType: "CUSTOMER",
      actorId: params.userId,
      action: "payment.intent_created",
      entityType: "payment_intent",
      entityId: intent.id,
      metadata: { orderId: order.orderId, provider: "WOMPI", amountCop: order.totalCop },
    });
  }

  return { paymentIntentId: intent.id, checkoutUrl, reused };
}

/* ────────────────────────── PayPal ────────────────────────── */

export interface InitPaypalPaymentParams {
  orderId: string;
  accessToken?: string;
  userId?: string;
  returnBaseUrl: string;
}

export interface InitPaypalPaymentResult {
  paymentIntentId: string;
  approvalUrl: string;
  reused: boolean;
}

export async function initPaypalPayment(
  pool: Pool,
  params: InitPaypalPaymentParams,
): Promise<InitPaypalPaymentResult> {
  const order = await loadOwnedOrder(pool, params);
  assertPayable(order);

  const amountUsd = copToUsd(order.totalCop);
  const { intent, reused } = await createOrReuseIntent(pool, {
    orderId: order.orderId,
    provider: "PAYPAL",
    amountCop: order.totalCop,
    amountUsd,
    currency: "USD",
  });

  if (reused && intent.status === "INITIATED" && intent.provider_ref) {
    // Ya se creó una orden de PayPal para este intento — no crear otra
    // (evita huérfanas del lado de PayPal por doble clic).
    const existing = await getPaypalOrder(intent.provider_ref).catch(() => undefined);
    const approvalUrl = existing?.links?.find((l) => l.rel === "approve")?.href;
    if (approvalUrl) return { paymentIntentId: intent.id, approvalUrl, reused: true };
    // Si PayPal ya no tiene el link (orden vencida de su lado), sigue abajo
    // y crea una nueva para el mismo `payment_intent`.
  }

  let paypalOrder;
  try {
    paypalOrder = await createPaypalOrder({
      referenceId: intent.id,
      amountUsd,
      returnUrl: `${params.returnBaseUrl}/checkout/resultado/${intent.id}`,
      cancelUrl: `${params.returnBaseUrl}/checkout`,
    });
  } catch (error) {
    await markIntentFailed(pool, intent.id, (error as Error).message);
    throw error;
  }

  const approvalUrl = paypalOrder.links?.find((l) => l.rel === "approve")?.href;
  if (!approvalUrl) {
    await markIntentFailed(pool, intent.id, "PayPal no devolvió un link de aprobación");
    throw new Error("PayPal no devolvió un link de aprobación");
  }

  await markIntentInitiated(pool, intent.id, { providerRef: paypalOrder.id, rawPayload: paypalOrder });
  await writeAudit(createDb(pool), {
    actorType: "CUSTOMER",
    actorId: params.userId,
    action: "payment.intent_created",
    entityType: "payment_intent",
    entityId: intent.id,
    metadata: { orderId: order.orderId, provider: "PAYPAL", amountCop: order.totalCop },
  });

  return { paymentIntentId: intent.id, approvalUrl, reused: false };
}

export interface CapturePaypalPaymentParams {
  paymentIntentId: string;
  accessToken?: string;
  userId?: string;
}

export interface CapturePaypalPaymentResult {
  status: "APPROVED" | "DECLINED" | "PENDING";
}

/**
 * La captura es SÍNCRONA — PayPal cobra en el momento de esta llamada, así
 * que se aplica el resultado ahí mismo en vez de esperar el webhook
 * `PAYMENT.CAPTURE.COMPLETED` (que igual llega después, y es un no-op
 * idempotente gracias al guard de `applyApprovedPayment` sobre el estado
 * terminal del intent).
 *
 * `paypalOrderId` NUNCA lo manda el cliente — sale de
 * `payment_intents.provider_ref`, guardado en `initPaypalPayment`.
 */
export async function capturePaypalPayment(
  pool: Pool,
  params: CapturePaypalPaymentParams,
): Promise<CapturePaypalPaymentResult> {
  const db = createDb(pool);
  const { rows } = (await db.execute(sql`
    SELECT id, order_id, provider_ref, status FROM payment_intents
     WHERE id = ${params.paymentIntentId}::uuid AND provider = 'PAYPAL'
  `)) as unknown as { rows: Array<{ id: string; order_id: string; provider_ref: string | null; status: string }> };

  const intent = rows[0];
  if (!intent || !intent.provider_ref) throw new OrderNotFoundError();

  // Prueba de propiedad: el pedido dueño de este intent tiene que ser el
  // mismo que `accessToken`/sesión autorizan — mismo criterio IDOR que el
  // resto del checkout.
  await loadOwnedOrder(pool, { orderId: intent.order_id, accessToken: params.accessToken, userId: params.userId });

  if (intent.status === "APPROVED") return { status: "APPROVED" };
  if (intent.status === "FAILED") return { status: "DECLINED" };

  const captureResponse = await capturePaypalOrder(intent.provider_ref, params.paymentIntentId);
  const capture = captureResponse.purchase_units?.[0]?.payments?.captures?.[0];

  if (captureResponse.status === "COMPLETED" && capture?.status === "COMPLETED") {
    await applyApprovedPayment(pool, {
      paymentIntentId: intent.id,
      providerRef: capture.id,
      amountReceived: Number(capture.amount?.value ?? 0),
      currency: "USD",
      rawPayload: captureResponse,
    });
    return { status: "APPROVED" };
  }

  if (captureResponse.status === "VOIDED" || capture?.status === "DECLINED") {
    await applyFailedPayment(pool, intent.id, captureResponse.status);
    return { status: "DECLINED" };
  }

  // PENDING (revisión de fraude de PayPal): ni aprobado ni rechazado
  // todavía — el webhook resuelve esto más tarde.
  return { status: "PENDING" };
}


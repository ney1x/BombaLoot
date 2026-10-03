import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { createDb } from "../../db/client";
import type { OrderView } from "../checkout-service";
import { OrderNotFoundError } from "./errors";
import { loadOwnedOrder } from "./order-access";
import { syncPaymentIntentWithProvider } from "./webhook-service";

/**
 * Caso C del diseño ("webhook perdido"): si el `payment_intent` lleva más
 * de un minuto en `INITIATED`, es razonable sospechar que el webhook nunca
 * va a llegar (o ya llegó y se perdió) — se consulta al proveedor
 * directamente ANTES de responder, así el cliente que recarga la página
 * nunca se queda mirando un "procesando" que no avanza solo.
 */
const STALE_INITIATED_MS = 60_000;

export interface PaymentResultView {
  paymentIntentId: string;
  provider: "WOMPI" | "PAYPAL";
  paymentIntentStatus: string;
  order: OrderView;
}

export async function getPaymentResult(
  pool: Pool,
  params: { paymentIntentId: string; accessToken?: string; userId?: string },
): Promise<PaymentResultView> {
  const db = createDb(pool);

  const { rows } = (await db.execute(sql`
    SELECT id, order_id, provider, status, updated_at FROM payment_intents WHERE id = ${params.paymentIntentId}::uuid
  `)) as unknown as {
    rows: Array<{ id: string; order_id: string; provider: string; status: string; updated_at: string }>;
  };
  const intent = rows[0];
  if (!intent) throw new OrderNotFoundError();

  // Prueba de propiedad antes de sincronizar ni de devolver nada — mismo
  // criterio IDOR que el resto del checkout.
  await loadOwnedOrder(pool, { orderId: intent.order_id, accessToken: params.accessToken, userId: params.userId });

  const stale = Date.now() - new Date(intent.updated_at).getTime() > STALE_INITIATED_MS;
  if (intent.status === "INITIATED" && stale) {
    await syncPaymentIntentWithProvider(pool, intent.id);
  }

  const order = await loadOwnedOrder(pool, { orderId: intent.order_id, accessToken: params.accessToken, userId: params.userId });
  const { rows: freshIntent } = (await db.execute(
    sql`SELECT status FROM payment_intents WHERE id = ${intent.id}::uuid`,
  )) as unknown as { rows: Array<{ status: string }> };

  return {
    paymentIntentId: intent.id,
    provider: intent.provider as "WOMPI" | "PAYPAL",
    paymentIntentStatus: freshIntent[0]?.status ?? intent.status,
    order,
  };
}

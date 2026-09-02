import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkoutCart,
  getOrderByAccessToken,
  resetIdempotencyCache,
  sweepExpiredPendingOrders,
  type CheckoutOwner,
} from "@/server/services/checkout-service";
import { resetRateLimits } from "@/server/services/rate-limit";
import {
  TEST_PRODUCT_ID,
  countByStatus,
  createTestDatabase,
  resetData,
  seedLoyaltyTiers,
  seedProduct,
} from "./helpers/database";
import {
  capturePaypalPayment,
  initPaypalPayment,
  initWompiPayment,
} from "@/server/services/payment/payment-intent-service";
import {
  processPaypalWebhook,
  processWompiWebhook,
  syncPaymentIntentWithProvider,
} from "@/server/services/payment/webhook-service";
import {
  claimNextRefundRequest,
  createRefundRequest,
  processClaimedRefund,
} from "@/server/services/payment/refund-service";
import { resetPaypalTokenCache } from "@/server/services/payment/paypal-client";
import { claimNextStaleIntent, runReconciliationBatch } from "@/server/services/payment/reconciliation-service";
import { verifyWompiWebhookSignature } from "@/server/services/payment/wompi-client";

/**
 * Claves de prueba, deterministas y sin valor real — mismo criterio que
 * `CODE_ENCRYPTION_KEY` en `helpers/database.ts`.
 */
process.env.WOMPI_PUBLIC_KEY ??= "pub_test_123";
process.env.WOMPI_PRIVATE_KEY ??= "priv_test_123";
process.env.WOMPI_INTEGRITY_SECRET ??= "integrity_test_secret";
process.env.WOMPI_EVENTS_SECRET ??= "events_test_secret";
process.env.PAYPAL_CLIENT_ID ??= "paypal_client_test";
process.env.PAYPAL_CLIENT_SECRET ??= "paypal_secret_test";
process.env.PAYPAL_WEBHOOK_ID ??= "webhook_id_test";
process.env.APP_URL ??= "http://localhost:3000";
process.env.USD_COP_EXCHANGE_RATE ??= "4000";

let pool: Pool;

beforeAll(async () => {
  pool = await createTestDatabase();
}, 120_000);

afterAll(async () => {
  await pool?.end();
});

/* ────────────────────────── fetch mock (checkout/webhook de Wompi no lo necesitan; Caso C y PayPal sí) ────────────────────────── */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function defaultFetchImpl(url: string): Promise<Response> {
  if (url.includes("/v1/oauth2/token")) {
    return jsonResponse({ access_token: "test-access-token", expires_in: 32_400 });
  }
  if (url.includes("/v1/notifications/verify-webhook-signature")) {
    return jsonResponse({ verification_status: "SUCCESS" });
  }
  return jsonResponse({ error: "unhandled in test", url }, 500);
}

let fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = defaultFetchImpl;

beforeEach(async () => {
  await resetData(pool);
  await seedLoyaltyTiers(pool);
  await resetRateLimits(pool);
  resetIdempotencyCache();
  resetPaypalTokenCache();
  fetchImpl = defaultFetchImpl;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fetchImpl(url, init));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ────────────────────────── helpers ────────────────────────── */

function guestOwner(email = "buyer@test.local"): CheckoutOwner {
  return { type: "guest", guestKey: `guest-${Math.random().toString(36).slice(2)}`, email, name: null };
}

async function createPendingOrder(codeCount: number, quantity = 1) {
  await seedProduct(pool, { codeCount });
  return checkoutCart(pool, {
    lines: [{ productId: TEST_PRODUCT_ID, quantity }],
    idempotencyKey: randomUUID(),
    owner: guestOwner(),
  });
}

function resolveWompiPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function wompiEvent(params: { reference: string; transactionId: string; status: string; amountInCents: number }): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const data = {
    transaction: {
      id: params.transactionId,
      reference: params.reference,
      status: params.status,
      amount_in_cents: params.amountInCents,
      currency: "COP",
      customer_email: "buyer@test.local",
      payment_method_type: "NEQUI",
      created_at: new Date().toISOString(),
    },
  };
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const concatenated =
    properties.map((p) => String(resolveWompiPath(data, p) ?? "")).join("") +
    String(timestamp) +
    process.env.WOMPI_EVENTS_SECRET;
  const checksum = createHash("sha256").update(concatenated).digest("hex");
  return JSON.stringify({ event: "transaction.updated", data, signature: { checksum, properties }, timestamp });
}

async function initPaypal(order: { orderId: string; accessToken: string | null }) {
  fetchImpl = async (url) => {
    if (url.includes("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 32_400 });
    if (url.includes("/v2/checkout/orders") && !url.includes("capture")) {
      return jsonResponse({ id: "PAYPAL-ORD-1", status: "CREATED", links: [{ rel: "approve", href: "https://paypal.test/approve" }] });
    }
    return jsonResponse({ error: "unexpected" }, 404);
  };
  return initPaypalPayment(pool, {
    orderId: order.orderId,
    accessToken: order.accessToken!,
    returnBaseUrl: "http://localhost:3000",
  });
}

/* ════════════════════════════ firma de Wompi (pura, sin DB) ════════════════════════════ */

describe("firma de webhook de Wompi", () => {
  it("verifica correctamente un evento bien firmado", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const data = { transaction: { id: "tx-1", status: "APPROVED", amount_in_cents: 5000 } };
    const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
    const concatenated =
      properties.map((p) => String(resolveWompiPath(data, p))).join("") + String(timestamp) + process.env.WOMPI_EVENTS_SECRET;
    const checksum = createHash("sha256").update(concatenated).digest("hex");

    expect(verifyWompiWebhookSignature({ event: "x", data, signature: { checksum, properties }, timestamp })).toBe(true);
  });

  it("rechaza un checksum manipulado", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const data = { transaction: { id: "tx-1", status: "APPROVED", amount_in_cents: 5000 } };
    expect(
      verifyWompiWebhookSignature({
        event: "x",
        data,
        signature: { checksum: "0".repeat(64), properties: ["transaction.id"] },
        timestamp,
      }),
    ).toBe(false);
  });
});

/* ════════════════════════════ concurrencia: doble clic en "pagar" ════════════════════════════ */

describe("payment_intents_active_per_order_idx — candado de concurrencia", () => {
  it("dos clics simultáneos en pagar no crean dos intentos activos", async () => {
    const order = await createPendingOrder(3);

    const [a, b] = await Promise.all([
      initWompiPayment(pool, { orderId: order.orderId, accessToken: order.accessToken!, redirectBaseUrl: "http://localhost:3000" }),
      initWompiPayment(pool, { orderId: order.orderId, accessToken: order.accessToken!, redirectBaseUrl: "http://localhost:3000" }),
    ]);

    expect(a.paymentIntentId).toBe(b.paymentIntentId);
    expect([a.reused, b.reused].filter(Boolean)).toHaveLength(1);

    const { rows } = await pool.query<{ n: string }>(
      "SELECT count(*)::int AS n FROM payment_intents WHERE order_id = $1",
      [order.orderId],
    );
    expect(Number(rows[0].n)).toBe(1);
  });
});

/* ════════════════════════════ Caso A — pago normal ════════════════════════════ */

describe("Caso A — webhook Wompi aprueba un pago con código disponible", () => {
  it("marca PAID + PENDING_DELIVERY y entrega los códigos", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initWompiPayment(pool, {
      orderId: order.orderId,
      accessToken: order.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });
    expect(init.checkoutUrl).toContain("checkout.wompi.co");

    const payload = wompiEvent({
      reference: init.paymentIntentId,
      transactionId: "wompi-tx-caso-a",
      status: "APPROVED",
      amountInCents: order.totalCop * 100,
    });

    const result = await processWompiWebhook(pool, payload);
    expect(result.status).toBe(200);

    const fresh = await getOrderByAccessToken(pool, order.accessToken!);
    expect(fresh!.paymentStatus).toBe("PAID");
    expect(fresh!.deliveryStatus).toBe("PENDING");
    expect(fresh!.orderStatus).toBe("PAID_PENDING_DELIVERY");
    expect(await countByStatus(pool, TEST_PRODUCT_ID)).toMatchObject({ PAID: 1, AVAILABLE: 1 });
  });
});

/* ════════════════════════════ Caso D — webhook duplicado ════════════════════════════ */

describe("Caso D — webhook duplicado", () => {
  it("procesa el mismo evento una sola vez", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initWompiPayment(pool, {
      orderId: order.orderId,
      accessToken: order.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });
    const payload = wompiEvent({
      reference: init.paymentIntentId,
      transactionId: "wompi-tx-dup",
      status: "APPROVED",
      amountInCents: order.totalCop * 100,
    });

    const first = await processWompiWebhook(pool, payload);
    const second = await processWompiWebhook(pool, payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((second.body as { duplicate?: boolean }).duplicate).toBe(true);

    const { rows } = await pool.query<{ n: string }>(
      "SELECT count(*)::int AS n FROM payment_events WHERE event_id = 'wompi-tx-dup'",
    );
    expect(Number(rows[0].n)).toBe(1);
  });
});

/* ════════════════════════════ webhook: firma inválida ════════════════════════════ */

describe("webhook con firma inválida", () => {
  it("se rechaza sin tocar el pedido", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initWompiPayment(pool, {
      orderId: order.orderId,
      accessToken: order.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });
    const payload = JSON.parse(
      wompiEvent({
        reference: init.paymentIntentId,
        transactionId: "wompi-tx-bad-sig",
        status: "APPROVED",
        amountInCents: order.totalCop * 100,
      }),
    );
    payload.signature.checksum = "0".repeat(64);

    const result = await processWompiWebhook(pool, JSON.stringify(payload));
    expect(result.status).toBe(401);

    const fresh = await getOrderByAccessToken(pool, order.accessToken!);
    expect(fresh!.paymentStatus).toBe("PENDING");
  });
});

/* ════════════════════════════ webhook: monto manipulado ════════════════════════════ */

describe("webhook con monto manipulado", () => {
  it("rechaza cuando el monto no coincide con el payment_intent", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initWompiPayment(pool, {
      orderId: order.orderId,
      accessToken: order.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });
    const payload = wompiEvent({
      reference: init.paymentIntentId,
      transactionId: "wompi-tx-amt",
      status: "APPROVED",
      amountInCents: 100, // muy distinto del total real del pedido
    });

    await expect(processWompiWebhook(pool, payload)).rejects.toThrow();

    const fresh = await getOrderByAccessToken(pool, order.accessToken!);
    expect(fresh!.paymentStatus).toBe("PENDING");
  });
});

/* ════════════════════════════ Caso E — webhook fuera de orden ════════════════════════════ */

describe("Caso E — webhook fuera de orden", () => {
  it("un evento contradictorio después de uno ya procesado no retrocede el estado", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initWompiPayment(pool, {
      orderId: order.orderId,
      accessToken: order.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });

    await processWompiWebhook(
      pool,
      wompiEvent({
        reference: init.paymentIntentId,
        transactionId: "wompi-tx-e1",
        status: "APPROVED",
        amountInCents: order.totalCop * 100,
      }),
    );

    const second = await processWompiWebhook(
      pool,
      wompiEvent({
        reference: init.paymentIntentId,
        transactionId: "wompi-tx-e2",
        status: "DECLINED",
        amountInCents: order.totalCop * 100,
      }),
    );

    expect(second.status).toBe(200);
    const fresh = await getOrderByAccessToken(pool, order.accessToken!);
    expect(fresh!.paymentStatus).toBe("PAID"); // no retrocedió a FAILED
  });
});

/* ════════════════════════════ Caso C — webhook perdido, sincronización manual ════════════════════════════ */

describe("Caso C — Wompi: sincronización manual cuando el webhook nunca llegó", () => {
  it("consulta por reference y aplica el pago si el proveedor dice aprobado", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initWompiPayment(pool, {
      orderId: order.orderId,
      accessToken: order.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });

    fetchImpl = async (url) => {
      if (url.includes(`/transactions?reference=${init.paymentIntentId}`)) {
        return jsonResponse({
          data: [
            {
              id: "WOMPI-TX-SYNC-APPROVED",
              reference: init.paymentIntentId,
              status: "APPROVED",
              amount_in_cents: order.totalCop * 100,
              currency: "COP",
              customer_email: "buyer@test.local",
              payment_method_type: "NEQUI",
              created_at: new Date().toISOString(),
            },
          ],
        });
      }
      return jsonResponse({ error: "unexpected", url }, 404);
    };

    const result = await syncPaymentIntentWithProvider(pool, init.paymentIntentId);
    expect(result.synced).toBe(true);

    const fresh = await getOrderByAccessToken(pool, order.accessToken!);
    expect(fresh!.paymentStatus).toBe("PAID");
  });

  it("aplica el rechazo y libera los códigos si el proveedor dice declinado", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initWompiPayment(pool, {
      orderId: order.orderId,
      accessToken: order.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });

    fetchImpl = async (url) => {
      if (url.includes(`/transactions?reference=${init.paymentIntentId}`)) {
        return jsonResponse({
          data: [
            {
              id: "WOMPI-TX-SYNC-DECLINED",
              reference: init.paymentIntentId,
              status: "DECLINED",
              amount_in_cents: order.totalCop * 100,
              currency: "COP",
              created_at: new Date().toISOString(),
            },
          ],
        });
      }
      return jsonResponse({ error: "unexpected", url }, 404);
    };

    const result = await syncPaymentIntentWithProvider(pool, init.paymentIntentId);
    expect(result.synced).toBe(true);

    const fresh = await getOrderByAccessToken(pool, order.accessToken!);
    expect(fresh!.paymentStatus).toBe("FAILED");
  });

  it("no sincroniza (ni llama al proveedor) si el intent ya no está INITIATED", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initWompiPayment(pool, {
      orderId: order.orderId,
      accessToken: order.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });

    await processWompiWebhook(
      pool,
      wompiEvent({
        reference: init.paymentIntentId,
        transactionId: "wompi-tx-already-approved",
        status: "APPROVED",
        amountInCents: order.totalCop * 100,
      }),
    );

    fetchImpl = async (url) => jsonResponse({ error: "no debería llamarse", url }, 500);

    const result = await syncPaymentIntentWithProvider(pool, init.paymentIntentId);
    expect(result.synced).toBe(false); // ya estaba en estado terminal, no-op
  });
});

/* ════════════════════════════ Caso B / G — pago sin código disponible ════════════════════════════ */

describe("Caso B/G — pago confirmado sin código disponible", () => {
  it("marca PAID + UNAVAILABLE y crea un refund_request", async () => {
    const order = await createPendingOrder(1, 1);
    const init = await initWompiPayment(pool, {
      orderId: order.orderId,
      accessToken: order.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });

    // Simula Caso G: la reserva/pedido vence y el barrido corre ANTES de
    // que el webhook (tardío) llegue.
    await pool.query("UPDATE orders SET payment_expires_at = now() - interval '1 second' WHERE id = $1", [
      order.orderId,
    ]);
    await sweepExpiredPendingOrders(pool);

    const payload = wompiEvent({
      reference: init.paymentIntentId,
      transactionId: "wompi-tx-late",
      status: "APPROVED",
      amountInCents: order.totalCop * 100,
    });
    await processWompiWebhook(pool, payload);

    const { rows: orderRows } = await pool.query<{ payment_status: string; delivery_status: string }>(
      "SELECT payment_status, delivery_status FROM orders WHERE id = $1",
      [order.orderId],
    );
    expect(orderRows[0].payment_status).toBe("PAID");
    expect(orderRows[0].delivery_status).toBe("UNAVAILABLE");

    const { rows: refundRows } = await pool.query<{ status: string; provider_request_id: string }>(
      "SELECT status, provider_request_id FROM refund_requests WHERE order_id = $1",
      [order.orderId],
    );
    expect(refundRows).toHaveLength(1);
    expect(refundRows[0].status).toBe("PENDING_REFUND");
    expect(refundRows[0].provider_request_id).toBeTruthy();
  });
});

/* ════════════════════════════ Refund — concurrencia del worker ════════════════════════════ */

describe("Refund — concurrencia del worker (FOR UPDATE SKIP LOCKED)", () => {
  it("dos workers concurrentes nunca toman la misma refund_request", async () => {
    const orderA = await createPendingOrder(1, 1);
    const initA = await initWompiPayment(pool, {
      orderId: orderA.orderId,
      accessToken: orderA.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });
    const orderB = await createPendingOrder(1, 1);
    const initB = await initWompiPayment(pool, {
      orderId: orderB.orderId,
      accessToken: orderB.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });

    await createRefundRequest(pool, {
      orderId: orderA.orderId,
      paymentIntentId: initA.paymentIntentId,
      provider: "WOMPI",
      amountCop: orderA.totalCop,
      amountUsd: null,
      currency: "COP",
    });
    await createRefundRequest(pool, {
      orderId: orderB.orderId,
      paymentIntentId: initB.paymentIntentId,
      provider: "WOMPI",
      amountCop: orderB.totalCop,
      amountUsd: null,
      currency: "COP",
    });

    const [claim1, claim2] = await Promise.all([claimNextRefundRequest(pool), claimNextRefundRequest(pool)]);

    expect(claim1).not.toBeNull();
    expect(claim2).not.toBeNull();
    expect(claim1!.id).not.toBe(claim2!.id);

    const { rows } = await pool.query<{ status: string }>(
      "SELECT status FROM refund_requests WHERE id = ANY($1::uuid[])",
      [[claim1!.id, claim2!.id]],
    );
    expect(rows.every((r) => r.status === "REFUND_INITIATED")).toBe(true);
  });

  it("una tercera llamada sin filas pendientes devuelve null", async () => {
    expect(await claimNextRefundRequest(pool)).toBeNull();
  });
});

/* ════════════════════════════ Refund — Wompi post-captura ════════════════════════════ */

describe("Refund — Wompi fuera de la ventana de void", () => {
  it("cae a MANUAL_REVIEW_REQUIRED sin inventar una API de refund", async () => {
    const order = await createPendingOrder(1, 1);
    const init = await initWompiPayment(pool, {
      orderId: order.orderId,
      accessToken: order.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });
    await pool.query(
      "UPDATE payment_intents SET created_at = now() - interval '3 hours', provider_ref = 'wompi-tx-old', status = 'APPROVED' WHERE id = $1",
      [init.paymentIntentId],
    );

    const refundId = await createRefundRequest(pool, {
      orderId: order.orderId,
      paymentIntentId: init.paymentIntentId,
      provider: "WOMPI",
      amountCop: order.totalCop,
      amountUsd: null,
      currency: "COP",
    });

    let networkCalled = false;
    fetchImpl = async () => {
      networkCalled = true;
      return jsonResponse({}, 500);
    };

    const claimed = await claimNextRefundRequest(pool);
    await processClaimedRefund(pool, claimed!);

    expect(networkCalled).toBe(false); // no se intenta void fuera de la ventana

    const { rows } = await pool.query<{ status: string; error_message: string }>(
      "SELECT status, error_message FROM refund_requests WHERE id = $1",
      [refundId],
    );
    expect(rows[0].status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(rows[0].error_message).toMatch(/ventana de void/i);
  });
});

/* ════════════════════════════ Refund — PayPal automático ════════════════════════════ */

describe("Refund — PayPal completa automáticamente", () => {
  it("marca REFUND_COMPLETED y el pedido como REFUNDED", async () => {
    const order = await createPendingOrder(1, 1);
    const init = await initPaypal(order);
    await pool.query("UPDATE payment_intents SET status = 'APPROVED', provider_ref = 'CAPTURE-XYZ' WHERE id = $1", [
      init.paymentIntentId,
    ]);

    const refundId = await createRefundRequest(pool, {
      orderId: order.orderId,
      paymentIntentId: init.paymentIntentId,
      provider: "PAYPAL",
      amountCop: order.totalCop,
      amountUsd: 7.1,
      currency: "USD",
    });

    const claimed = await claimNextRefundRequest(pool);

    fetchImpl = async (url) => {
      if (url.includes("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 32_400 });
      if (url.includes("/refund")) {
        return jsonResponse({ id: "REFUND-1", status: "COMPLETED", amount: { currency_code: "USD", value: "7.10" } }, 201);
      }
      return jsonResponse({ error: "unexpected" }, 404);
    };

    await processClaimedRefund(pool, claimed!);

    const { rows } = await pool.query<{ status: string }>("SELECT status FROM refund_requests WHERE id = $1", [
      refundId,
    ]);
    expect(rows[0].status).toBe("REFUND_COMPLETED");

    const { rows: orderRows } = await pool.query<{ payment_status: string }>(
      "SELECT payment_status FROM orders WHERE id = $1",
      [order.orderId],
    );
    expect(orderRows[0].payment_status).toBe("REFUNDED");
  });
});

/* ════════════════════════════ Refund — tope de reintentos ════════════════════════════ */

describe("Refund — tope de reintentos automáticos", () => {
  it("después de 10 intentos cae a revisión manual sin llamar al proveedor", async () => {
    const order = await createPendingOrder(1, 1);
    const init = await initPaypal(order);
    await pool.query("UPDATE payment_intents SET status = 'APPROVED', provider_ref = 'CAPTURE-MAX' WHERE id = $1", [
      init.paymentIntentId,
    ]);
    const refundId = await createRefundRequest(pool, {
      orderId: order.orderId,
      paymentIntentId: init.paymentIntentId,
      provider: "PAYPAL",
      amountCop: order.totalCop,
      amountUsd: 7.1,
      currency: "USD",
    });

    await pool.query("UPDATE refund_requests SET attempt_count = 11 WHERE id = $1", [refundId]);
    const claimed = await claimNextRefundRequest(pool);
    expect(claimed!.attemptCount).toBeGreaterThan(10);

    let networkCalled = false;
    fetchImpl = async () => {
      networkCalled = true;
      return jsonResponse({}, 500);
    };

    await processClaimedRefund(pool, claimed!);
    expect(networkCalled).toBe(false);

    const { rows } = await pool.query<{ status: string }>("SELECT status FROM refund_requests WHERE id = $1", [
      refundId,
    ]);
    expect(rows[0].status).toBe("MANUAL_REVIEW_REQUIRED");
  });
});

/* ════════════════════════════ PayPal — captura síncrona ════════════════════════════ */

describe("PayPal — captura síncrona", () => {
  it("aprueba el pago en la captura sin esperar el webhook", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initPaypal(order);

    fetchImpl = async (url) => {
      if (url.includes("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 32_400 });
      if (url.includes("/capture")) {
        return jsonResponse({
          id: "PAYPAL-ORD-1",
          status: "COMPLETED",
          purchase_units: [
            {
              reference_id: init.paymentIntentId,
              payments: {
                captures: [{ id: "CAPTURE-1", status: "COMPLETED", amount: { currency_code: "USD", value: "7.10" } }],
              },
            },
          ],
        });
      }
      return jsonResponse({ error: "unexpected" }, 404);
    };

    const result = await capturePaypalPayment(pool, {
      paymentIntentId: init.paymentIntentId,
      accessToken: order.accessToken!,
    });
    expect(result.status).toBe("APPROVED");

    const fresh = await getOrderByAccessToken(pool, order.accessToken!);
    expect(fresh!.paymentStatus).toBe("PAID");
  });
});

/* ════════════════════════════ PayPal — webhook ════════════════════════════ */

describe("PayPal — webhook", () => {
  it("aprueba el pago desde el webhook con firma válida", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initPaypal(order);

    fetchImpl = async (url) => {
      if (url.includes("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 32_400 });
      if (url.includes("verify-webhook-signature")) return jsonResponse({ verification_status: "SUCCESS" });
      return jsonResponse({ error: "unexpected" }, 404);
    };

    const event = {
      id: "WH-EVENT-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAPTURE-WH-1",
        status: "COMPLETED",
        purchase_units: [
          {
            reference_id: init.paymentIntentId,
            payments: {
              captures: [{ id: "CAPTURE-WH-1", status: "COMPLETED", amount: { currency_code: "USD", value: "7.10" } }],
            },
          },
        ],
      },
    };

    const result = await processPaypalWebhook(pool, JSON.stringify(event), {
      transmissionId: "t1",
      transmissionTime: "2026-01-01T00:00:00Z",
      transmissionSig: "sig",
      certUrl: "https://api.paypal.com/cert",
      authAlgo: "SHA256withRSA",
    });

    expect(result.status).toBe(200);
    const fresh = await getOrderByAccessToken(pool, order.accessToken!);
    expect(fresh!.paymentStatus).toBe("PAID");
  });

  it("rechaza cuando la verificación de firma falla", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initPaypal(order);

    fetchImpl = async (url) => {
      if (url.includes("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 32_400 });
      if (url.includes("verify-webhook-signature")) return jsonResponse({ verification_status: "FAILURE" });
      return jsonResponse({ error: "unexpected" }, 404);
    };

    const event = {
      id: "WH-EVENT-BAD",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "X", status: "COMPLETED", purchase_units: [{ reference_id: init.paymentIntentId }] },
    };

    const result = await processPaypalWebhook(pool, JSON.stringify(event), {
      transmissionId: "t2",
      transmissionTime: "2026-01-01T00:00:00Z",
      transmissionSig: "bad-sig",
      certUrl: "https://api.paypal.com/cert",
      authAlgo: "SHA256withRSA",
    });

    expect(result.status).toBe(401);
    const fresh = await getOrderByAccessToken(pool, order.accessToken!);
    expect(fresh!.paymentStatus).toBe("PENDING");
  });
});

/* ════════════════════════════ Caso C — PayPal: webhook perdido, sincronización manual ════════════════════════════ */

describe("Caso C — PayPal: sincronización manual cuando el webhook nunca llegó", () => {
  it("consulta la orden por id y aplica el pago si PayPal dice completada", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initPaypal(order); // provider_ref queda en "PAYPAL-ORD-1"

    fetchImpl = async (url) => {
      if (url.includes("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 32_400 });
      if (url.includes("/v2/checkout/orders/PAYPAL-ORD-1")) {
        return jsonResponse({
          id: "PAYPAL-ORD-1",
          status: "COMPLETED",
          purchase_units: [
            {
              reference_id: init.paymentIntentId,
              payments: {
                captures: [{ id: "CAPTURE-SYNC-1", status: "COMPLETED", amount: { currency_code: "USD", value: "7.10" } }],
              },
            },
          ],
        });
      }
      return jsonResponse({ error: "unexpected", url }, 404);
    };

    const result = await syncPaymentIntentWithProvider(pool, init.paymentIntentId);
    expect(result.synced).toBe(true);

    const fresh = await getOrderByAccessToken(pool, order.accessToken!);
    expect(fresh!.paymentStatus).toBe("PAID");
  });

  it("aplica el rechazo si PayPal dice que la orden quedó anulada", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initPaypal(order);

    fetchImpl = async (url) => {
      if (url.includes("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 32_400 });
      if (url.includes("/v2/checkout/orders/PAYPAL-ORD-1")) {
        return jsonResponse({ id: "PAYPAL-ORD-1", status: "VOIDED", purchase_units: [{ reference_id: init.paymentIntentId }] });
      }
      return jsonResponse({ error: "unexpected", url }, 404);
    };

    const result = await syncPaymentIntentWithProvider(pool, init.paymentIntentId);
    expect(result.synced).toBe(true);

    const fresh = await getOrderByAccessToken(pool, order.accessToken!);
    expect(fresh!.paymentStatus).toBe("FAILED");
  });

  it("no sincroniza si no existe un payment_intent con ese id", async () => {
    const order = await createPendingOrder(2, 1);
    // initPaypalPayment nunca corrió para este pedido — no hay ninguna fila en
    // payment_intents que coincida. Cubre la guarda `if (!intent || intent.status !== "INITIATED")`.
    const result = await syncPaymentIntentWithProvider(pool, order.orderId);
    expect(result.synced).toBe(false);
  });
});

/* ════════════════════════════ Fase 8 — conciliación proactiva (worker) ════════════════════════════ */

/** Empuja `payment_intents.updated_at` al pasado — simula un intent que lleva rato sin resolverse. */
async function ageIntent(paymentIntentId: string, minutesAgo: number): Promise<void> {
  await pool.query(`UPDATE payment_intents SET updated_at = now() - make_interval(mins => $2) WHERE id = $1`, [
    paymentIntentId,
    minutesAgo,
  ]);
}

describe("Conciliación proactiva — claimNextStaleIntent / runReconciliationBatch", () => {
  it("no toma un intent reciente (todavía dentro de la ventana normal)", async () => {
    const order = await createPendingOrder(2, 1);
    await initWompiPayment(pool, {
      orderId: order.orderId,
      accessToken: order.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });

    const claimed = await claimNextStaleIntent(pool);
    expect(claimed).toBeNull();
  });

  it("toma un intent Wompi atascado y lo concilia (aprobado)", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initWompiPayment(pool, {
      orderId: order.orderId,
      accessToken: order.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });
    await ageIntent(init.paymentIntentId, 10);

    fetchImpl = async (url) => {
      if (url.includes(`/transactions?reference=${init.paymentIntentId}`)) {
        return jsonResponse({
          data: [
            {
              id: "WOMPI-TX-RECONCILE",
              reference: init.paymentIntentId,
              status: "APPROVED",
              amount_in_cents: order.totalCop * 100,
              currency: "COP",
              customer_email: "buyer@test.local",
              payment_method_type: "NEQUI",
              created_at: new Date().toISOString(),
            },
          ],
        });
      }
      return jsonResponse({ error: "unexpected", url }, 404);
    };

    const result = await runReconciliationBatch(pool, 5);
    expect(result).toEqual({ checked: 1, synced: 1, errors: 0 });

    const fresh = await getOrderByAccessToken(pool, order.accessToken!);
    expect(fresh!.paymentStatus).toBe("PAID");
  });

  it("toma un intent PayPal atascado y lo concilia", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initPaypal(order);
    await ageIntent(init.paymentIntentId, 10);

    fetchImpl = async (url) => {
      if (url.includes("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 32_400 });
      if (url.includes("/v2/checkout/orders/PAYPAL-ORD-1")) {
        return jsonResponse({
          id: "PAYPAL-ORD-1",
          status: "COMPLETED",
          purchase_units: [
            {
              reference_id: init.paymentIntentId,
              payments: {
                captures: [{ id: "CAPTURE-RECONCILE", status: "COMPLETED", amount: { currency_code: "USD", value: "7.10" } }],
              },
            },
          ],
        });
      }
      return jsonResponse({ error: "unexpected", url }, 404);
    };

    const result = await runReconciliationBatch(pool, 5);
    expect(result).toEqual({ checked: 1, synced: 1, errors: 0 });

    const fresh = await getOrderByAccessToken(pool, order.accessToken!);
    expect(fresh!.paymentStatus).toBe("PAID");
  });

  it("un intent que sigue sin resolver del lado del proveedor no bloquea a los demás del lote", async () => {
    // `syncPaymentIntentWithProvider` ya absorbe los errores de red contra el
    // proveedor (`.catch(() => undefined)`, ver webhook-service.ts) y devuelve
    // `synced:false` en vez de tirar — el `errors` de acá es para lo que se
    // escape de esa capa (p. ej. un error de la propia base). Este test cubre
    // el caso más común: A sigue PENDING del lado de Wompi, B sí se resuelve,
    // y el lote no se corta en A.
    const orderA = await createPendingOrder(2, 1);
    const initA = await initWompiPayment(pool, {
      orderId: orderA.orderId,
      accessToken: orderA.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });
    await ageIntent(initA.paymentIntentId, 10);

    const orderB = await createPendingOrder(2, 1);
    const initB = await initWompiPayment(pool, {
      orderId: orderB.orderId,
      accessToken: orderB.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });
    await ageIntent(initB.paymentIntentId, 10);

    fetchImpl = async (url) => {
      if (url.includes(`/transactions?reference=${initA.paymentIntentId}`)) {
        return jsonResponse({ data: [] }); // Wompi: sin transacción todavía — sigue pendiente
      }
      if (url.includes(`/transactions?reference=${initB.paymentIntentId}`)) {
        return jsonResponse({
          data: [
            {
              id: "WOMPI-TX-RECONCILE-B",
              reference: initB.paymentIntentId,
              status: "APPROVED",
              amount_in_cents: orderB.totalCop * 100,
              currency: "COP",
              created_at: new Date().toISOString(),
            },
          ],
        });
      }
      return jsonResponse({ error: "unexpected", url }, 404);
    };

    const result = await runReconciliationBatch(pool, 5);
    expect(result.checked).toBe(2);
    expect(result.synced).toBe(1);
    expect(result.errors).toBe(0);

    const freshA = await getOrderByAccessToken(pool, orderA.accessToken!);
    expect(freshA!.paymentStatus).toBe("PENDING"); // A sigue sin resolverse, no se rompió nada
    const freshB = await getOrderByAccessToken(pool, orderB.accessToken!);
    expect(freshB!.paymentStatus).toBe("PAID");
  });

  it("respeta maxItems: con más intents atascados que el límite, corta ahí", async () => {
    for (let i = 0; i < 3; i += 1) {
      const order = await createPendingOrder(2, 1);
      const init = await initWompiPayment(pool, {
        orderId: order.orderId,
        accessToken: order.accessToken!,
        redirectBaseUrl: "http://localhost:3000",
      });
      await ageIntent(init.paymentIntentId, 10);
    }

    // Ningún intent llega a aprobarse en este test — solo importa cuántos se REVISAN.
    fetchImpl = async () => jsonResponse({ data: [] });

    const result = await runReconciliationBatch(pool, 2);
    expect(result.checked).toBe(2); // se frenó en el límite, quedó 1 sin tocar
  });

  it("dos workers concurrentes no toman el mismo intent atascado (FOR UPDATE SKIP LOCKED)", async () => {
    const order = await createPendingOrder(2, 1);
    const init = await initWompiPayment(pool, {
      orderId: order.orderId,
      accessToken: order.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });
    await ageIntent(init.paymentIntentId, 10);

    const [a, b] = await Promise.all([claimNextStaleIntent(pool), claimNextStaleIntent(pool)]);
    const claimedCount = [a, b].filter((x) => x !== null).length;
    expect(claimedCount).toBe(1);
  });
});

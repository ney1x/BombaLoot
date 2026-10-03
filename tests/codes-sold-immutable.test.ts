import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { checkoutCart, resetIdempotencyCache, sweepExpiredPendingOrders, type CheckoutOwner } from "@/server/services/checkout-service";
import { resetRateLimits } from "@/server/services/rate-limit";
import { releaseReservation } from "@/server/services/inventory";
import { withTransaction } from "@/server/db/client";
import { TEST_PRODUCT_ID, createTestDatabase, resetData, seedLoyaltyTiers, seedProduct } from "./helpers/database";
import { initWompiPayment } from "@/server/services/payment/payment-intent-service";
import { processWompiWebhook } from "@/server/services/payment/webhook-service";
import { claimNextRefundRequest, createRefundRequest, processClaimedRefund } from "@/server/services/payment/refund-service";
import { deliverOrderCodes } from "@/server/services/payment/delivery-service";

/**
 * Fase 5 (cierre) — demuestra formalmente que un código vendido
 * (`status IN ('PAID','DELIVERED')`) nunca vuelve al inventario, pase lo
 * que pase del lado del reembolso: refund exitoso, fallido, en revisión
 * manual, duplicado, concurrente, o un rollback a mitad de camino.
 *
 * La garantía real vive en dos capas independientes, y estos tests
 * ejercitan las dos:
 *  1. Ningún código de `webhook-service.ts` / `refund-service.ts` /
 *     `delivery-service.ts` escribe sobre un código ya vendido de forma
 *     que lo libere (verificado por inspección — ver el reporte de la
 *     sesión — y reforzado acá corriendo los flujos reales).
 *  2. El trigger `codes_prevent_sold_regression_trg`
 *     (0005_codes_sold_immutable.sql): aunque una capa futura tuviera un
 *     bug, la base rechaza la escritura.
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function defaultFetchImpl(): Promise<Response> {
  return jsonResponse({ error: "unhandled in test" }, 500);
}

let fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = defaultFetchImpl;

beforeEach(async () => {
  await resetData(pool);
  await seedLoyaltyTiers(pool);
  await resetRateLimits(pool);
  resetIdempotencyCache();
  fetchImpl = defaultFetchImpl;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fetchImpl(url, init));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function guestOwner(email = "buyer@test.local"): CheckoutOwner {
  return { type: "guest", guestKey: `guest-${Math.random().toString(36).slice(2)}`, email, name: null };
}

function resolveWompiPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/**
 * Además de armar el payload firmado, deja preparado el mock de `fetch`
 * para el GET a `/transactions/:id` que `processWompiWebhook` hace ahora
 * contra la API real de Wompi (hallazgo de la auditoría: la firma no cubre
 * `reference`, el handler vuelve a pedir la transacción por su id, que sí
 * está firmado). Sin este mock, todo test que llame a `processWompiWebhook`
 * fallaría acá, no por la firma.
 */
function wompiEvent(params: { reference: string; transactionId: string; status: string; amountInCents: number }): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const transaction = {
    id: params.transactionId,
    reference: params.reference,
    status: params.status,
    amount_in_cents: params.amountInCents,
    currency: "COP",
    customer_email: "buyer@test.local",
    payment_method_type: "NEQUI",
    created_at: new Date().toISOString(),
  };
  const data = { transaction };
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const concatenated =
    properties.map((p) => String(resolveWompiPath(data, p) ?? "")).join("") +
    String(timestamp) +
    process.env.WOMPI_EVENTS_SECRET;
  const checksum = createHash("sha256").update(concatenated).digest("hex");

  fetchImpl = async (url) => {
    if (url.includes(`/transactions/${params.transactionId}`)) {
      return jsonResponse({ data: transaction });
    }
    return jsonResponse({ error: "unexpected", url }, 404);
  };

  return JSON.stringify({ event: "transaction.updated", data, signature: { checksum, properties }, timestamp });
}

/** Pedido pagado de punta a punta (webhook APPROVED real). Devuelve el id físico del código. */
async function payOrder(codeCount = 1, quantity = 1) {
  await seedProduct(pool, { codeCount });
  const order = await checkoutCart(pool, {
    lines: [{ productId: TEST_PRODUCT_ID, quantity }],
    idempotencyKey: randomUUID(),
    owner: guestOwner(),
  });
  const init = await initWompiPayment(pool, {
    orderId: order.orderId,
    accessToken: order.accessToken!,
    redirectBaseUrl: "http://localhost:3000",
  });
  await processWompiWebhook(
    pool,
    wompiEvent({
      reference: init.paymentIntentId,
      transactionId: `wompi-tx-${randomUUID()}`,
      status: "APPROVED",
      amountInCents: order.totalCop * 100,
    }),
  );

  const { rows } = await pool.query<{ id: string; status: string; order_item_id: string }>(
    `SELECT c.id, c.status, c.order_item_id FROM codes c
       JOIN order_items oi ON oi.id = c.order_item_id
      WHERE oi.order_id = $1`,
    [order.orderId],
  );

  return { order, paymentIntentId: init.paymentIntentId, codeRows: rows };
}

async function codeSnapshot(codeId: string) {
  const { rows } = await pool.query<{ status: string; order_item_id: string | null; reservation_id: string | null }>(
    "SELECT status, order_item_id, reservation_id FROM codes WHERE id = $1",
    [codeId],
  );
  return rows[0];
}

/* ═══════════════════════════ A ═══════════════════════════ */

describe("A — código PAID, refund + sweep, sigue sin estar disponible", () => {
  it("sweepExpiredPendingOrders nunca toca un código de un pedido ya PAID", async () => {
    const { order, paymentIntentId, codeRows } = await payOrder(1, 1);
    expect(codeRows).toHaveLength(1);
    const codeId = codeRows[0].id;
    expect(codeRows[0].status).toBe("PAID");

    // Simula que ALGO (soporte manual, futuro flujo) creó un refund_request
    // para este pedido, aunque el código sigue asignado.
    await createRefundRequest(pool, {
      orderId: order.orderId,
      paymentIntentId,
      provider: "WOMPI",
      amountCop: order.totalCop,
      amountUsd: null,
      currency: "COP",
    });

    // El barrido corre igual (mantenimiento periódico) — no debe tocar nada acá.
    await sweepExpiredPendingOrders(pool);

    const after = await codeSnapshot(codeId);
    expect(after.status).toBe("PAID");
    expect(after.order_item_id).not.toBeNull();
  });
});

/* ═══════════════════════════ B ═══════════════════════════ */

describe("B — código asignado, worker de refund, sigue asignado", () => {
  it("processClaimedRefund nunca escribe sobre codes", async () => {
    const { order, paymentIntentId, codeRows } = await payOrder(1, 1);
    const codeId = codeRows[0].id;
    const before = await codeSnapshot(codeId);

    const refundId = await createRefundRequest(pool, {
      orderId: order.orderId,
      paymentIntentId,
      provider: "WOMPI",
      amountCop: order.totalCop,
      amountUsd: null,
      currency: "COP",
    });
    // Transacción vieja para forzar MANUAL_REVIEW_REQUIRED (sin red).
    await pool.query("UPDATE payment_intents SET created_at = now() - interval '3 hours' WHERE id = $1", [
      paymentIntentId,
    ]);

    const claimed = await claimNextRefundRequest(pool);
    expect(claimed!.id).toBe(refundId);
    await processClaimedRefund(pool, claimed!);

    const { rows: refundRows } = await pool.query<{ status: string }>(
      "SELECT status FROM refund_requests WHERE id = $1",
      [refundId],
    );
    expect(refundRows[0].status).toBe("MANUAL_REVIEW_REQUIRED");

    const after = await codeSnapshot(codeId);
    expect(after).toEqual(before);
  });
});

/* ═══════════════════════════ C ═══════════════════════════ */

describe("C — pago confirmado + webhook duplicado, código asignado una sola vez", () => {
  it("el segundo webhook no reasigna ni duplica el código", async () => {
    await seedProduct(pool, { codeCount: 1 });
    const order = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: randomUUID(),
      owner: guestOwner(),
    });
    const init = await initWompiPayment(pool, {
      orderId: order.orderId,
      accessToken: order.accessToken!,
      redirectBaseUrl: "http://localhost:3000",
    });
    const payload = wompiEvent({
      reference: init.paymentIntentId,
      transactionId: "wompi-tx-dup-code",
      status: "APPROVED",
      amountInCents: order.totalCop * 100,
    });

    await processWompiWebhook(pool, payload);
    const { rows: afterFirst } = await pool.query<{ id: string; order_item_id: string }>(
      `SELECT c.id, c.order_item_id FROM codes c
         JOIN order_items oi ON oi.id = c.order_item_id WHERE oi.order_id = $1`,
      [order.orderId],
    );
    expect(afterFirst).toHaveLength(1);

    await processWompiWebhook(pool, payload); // mismo evento, duplicado

    const { rows: afterSecond } = await pool.query<{ id: string; order_item_id: string; status: string }>(
      "SELECT id, order_item_id, status FROM codes WHERE product_id = $1",
      [TEST_PRODUCT_ID],
    );
    // Sigue habiendo exactamente 1 código en la base, PAID, apuntando al
    // MISMO order_item — el duplicado no lo tocó ni generó uno nuevo.
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].status).toBe("PAID");
    expect(afterSecond[0].order_item_id).toBe(afterFirst[0].order_item_id);
  });
});

/* ═══════════════════════════ D ═══════════════════════════ */

describe("D — refund fallido + retry, código no vuelve a AVAILABLE", () => {
  it("dos intentos de refund (uno con error, uno exitoso) dejan el código intacto", async () => {
    const { order, paymentIntentId, codeRows } = await payOrder(1, 1);
    const codeId = codeRows[0].id;

    await pool.query(
      "UPDATE payment_intents SET status = 'APPROVED', provider_ref = 'CAPTURE-D' WHERE id = $1",
      [paymentIntentId],
    );
    const refundId = await createRefundRequest(pool, {
      orderId: order.orderId,
      paymentIntentId,
      provider: "PAYPAL",
      amountCop: order.totalCop,
      amountUsd: 7.1,
      currency: "USD",
    });

    // Intento 1: falla (red caída).
    let attempt = 0;
    fetchImpl = async (url) => {
      attempt += 1;
      if (url.includes("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 32_400 });
      return jsonResponse({}, 500);
    };
    const claim1 = await claimNextRefundRequest(pool);
    await processClaimedRefund(pool, claim1!);
    expect(await codeSnapshot(codeId)).toMatchObject({ status: "PAID" });

    // Fuerza el reintento (sin esperar los 5 min reales).
    await pool.query("UPDATE refund_requests SET initiated_at = now() - interval '10 minutes' WHERE id = $1", [
      refundId,
    ]);

    // Intento 2: éxito.
    fetchImpl = async (url) => {
      if (url.includes("/v1/oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 32_400 });
      if (url.includes("/refund")) {
        return jsonResponse({ id: "REFUND-D", status: "COMPLETED", amount: { currency_code: "USD", value: "7.10" } }, 201);
      }
      return jsonResponse({}, 404);
    };
    const claim2 = await claimNextRefundRequest(pool);
    await processClaimedRefund(pool, claim2!);

    const { rows } = await pool.query<{ status: string }>("SELECT status FROM refund_requests WHERE id = $1", [
      refundId,
    ]);
    expect(rows[0].status).toBe("REFUND_COMPLETED");
    expect(attempt).toBeGreaterThan(0);

    const after = await codeSnapshot(codeId);
    expect(after.status).toBe("PAID"); // NUNCA volvió a AVAILABLE
    expect(after.order_item_id).not.toBeNull();
  });
});

/* ═══════════════════════════ E ═══════════════════════════ */

describe("E — código con order_item_id nunca se libera aunque la reserva expiró", () => {
  it("un código PAID sobrevive aunque payment_expires_at ya pasó", async () => {
    const { order, codeRows } = await payOrder(1, 1);
    const codeId = codeRows[0].id;

    // Aunque alguien pise `payment_expires_at` al pasado (columna que ya
    // no significa nada para un pedido PAID), el barrido no debe tocar
    // el código: su predicado exige payment_status = 'PENDING'.
    await pool.query("UPDATE orders SET payment_expires_at = now() - interval '1 hour' WHERE id = $1", [
      order.orderId,
    ]);
    await sweepExpiredPendingOrders(pool);

    const after = await codeSnapshot(codeId);
    expect(after.status).toBe("PAID");
    expect(after.order_item_id).not.toBeNull();
  });

  it("contraste: un código apenas RESERVED (pago nunca confirmado) sí se libera — comportamiento de fase 4 intacto", async () => {
    await seedProduct(pool, { codeCount: 1 });
    const order = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: randomUUID(),
      owner: guestOwner(),
    });
    await pool.query("UPDATE orders SET payment_expires_at = now() - interval '1 second' WHERE id = $1", [
      order.orderId,
    ]);
    await sweepExpiredPendingOrders(pool);

    const { rows } = await pool.query<{ status: string; order_item_id: string | null }>(
      "SELECT status, order_item_id FROM codes WHERE product_id = $1",
      [TEST_PRODUCT_ID],
    );
    expect(rows[0].status).toBe("AVAILABLE");
    expect(rows[0].order_item_id).toBeNull();
  });
});

/* ═══════════════════════════ F ═══════════════════════════ */

describe("F — dos workers de refund concurrentes nunca tocan el mismo código", () => {
  it("cada refund_request se procesa contra su propio pedido, sin cruzarse", async () => {
    const a = await payOrder(1, 1);
    const b = await payOrder(1, 1);

    await pool.query("UPDATE payment_intents SET created_at = now() - interval '3 hours' WHERE id = ANY($1::uuid[])", [
      [a.paymentIntentId, b.paymentIntentId],
    ]);

    await createRefundRequest(pool, {
      orderId: a.order.orderId,
      paymentIntentId: a.paymentIntentId,
      provider: "WOMPI",
      amountCop: a.order.totalCop,
      amountUsd: null,
      currency: "COP",
    });
    await createRefundRequest(pool, {
      orderId: b.order.orderId,
      paymentIntentId: b.paymentIntentId,
      provider: "WOMPI",
      amountCop: b.order.totalCop,
      amountUsd: null,
      currency: "COP",
    });

    const [claim1, claim2] = await Promise.all([claimNextRefundRequest(pool), claimNextRefundRequest(pool)]);
    expect(claim1!.id).not.toBe(claim2!.id);

    await Promise.all([processClaimedRefund(pool, claim1!), processClaimedRefund(pool, claim2!)]);

    const codeAAfter = await codeSnapshot(a.codeRows[0].id);
    const codeBAfter = await codeSnapshot(b.codeRows[0].id);
    expect(codeAAfter.status).toBe("PAID");
    expect(codeAAfter.order_item_id).toBe(a.codeRows[0].order_item_id);
    expect(codeBAfter.status).toBe("PAID");
    expect(codeBAfter.order_item_id).toBe(b.codeRows[0].order_item_id);
  });
});

/* ═══════════════════════════ G ═══════════════════════════ */

describe("G — rollback durante el refund deja el código consistente", () => {
  it("una transacción de refund que revienta a mitad de camino no deja nada a medio escribir, y codes ni se tocó", async () => {
    const { order, paymentIntentId, codeRows } = await payOrder(1, 1);
    const codeId = codeRows[0].id;
    const before = await codeSnapshot(codeId);

    await pool.query(
      "UPDATE payment_intents SET status = 'APPROVED', provider_ref = 'CAPTURE-G' WHERE id = $1",
      [paymentIntentId],
    );
    const refundId = await createRefundRequest(pool, {
      orderId: order.orderId,
      paymentIntentId,
      provider: "PAYPAL",
      amountCop: order.totalCop,
      amountUsd: 7.1,
      currency: "USD",
    });

    // Mismo shape que `markCompleted` (refund-service.ts): actualiza
    // refund_requests y orders, y después revienta a propósito. Ni ese
    // UPDATE ni el rollback tocan `codes` — no está en su alcance — y el
    // rollback además deshace lo que sí alcanzó a escribir.
    await expect(
      withTransaction(pool, async (tx) => {
        await tx.execute(
          sql`UPDATE refund_requests SET status = 'REFUND_COMPLETED', completed_at = now() WHERE id = ${refundId}::uuid`,
        );
        await tx.execute(sql`UPDATE orders SET payment_status = 'REFUNDED', updated_at = now() WHERE id = ${order.orderId}::uuid`);
        throw new Error("fallo forzado a mitad de la transacción de refund");
      }),
    ).rejects.toThrow("fallo forzado");

    // Rollback real: ni refund_requests ni orders quedaron a medio escribir.
    const { rows: refundRows } = await pool.query<{ status: string }>(
      "SELECT status FROM refund_requests WHERE id = $1",
      [refundId],
    );
    expect(refundRows[0].status).toBe("PENDING_REFUND");
    const { rows: orderRows } = await pool.query<{ payment_status: string }>(
      "SELECT payment_status FROM orders WHERE id = $1",
      [order.orderId],
    );
    expect(orderRows[0].payment_status).toBe("PAID");

    // Y `codes`, que nunca estuvo en el alcance de esa transacción, sigue exactamente igual.
    const after = await codeSnapshot(codeId);
    expect(after).toEqual(before);
  });
});

/* ═══════════════════════════ H ═══════════════════════════ */

describe("H — intento explícito de liberar un código vendido es rechazado", () => {
  it("el trigger de Postgres rechaza volver un código PAID a AVAILABLE", async () => {
    const { codeRows } = await payOrder(1, 1);
    const codeId = codeRows[0].id;

    await expect(
      pool.query("UPDATE codes SET status = 'AVAILABLE', order_item_id = NULL WHERE id = $1", [codeId]),
    ).rejects.toThrow(/no puede pasar a status=AVAILABLE|ya está vendido/);

    const after = await codeSnapshot(codeId);
    expect(after.status).toBe("PAID");
    expect(after.order_item_id).not.toBeNull();
  });

  it("el trigger rechaza mover el order_item_id de un código vendido a otro pedido", async () => {
    const { codeRows } = await payOrder(1, 1);
    const codeId = codeRows[0].id;

    // Crea un order_item de otro pedido para intentar "robarle" el código.
    await seedProduct(pool, { codeCount: 1, productId: "otro-producto-999" });
    const otherOrder = await checkoutCart(pool, {
      lines: [{ productId: "otro-producto-999", quantity: 1 }],
      idempotencyKey: randomUUID(),
      owner: guestOwner("otra@test.local"),
    });
    const { rows: otherOrderItems } = await pool.query<{ id: string }>(
      "SELECT id FROM order_items WHERE order_id = $1",
      [otherOrder.orderId],
    );

    await expect(
      pool.query("UPDATE codes SET order_item_id = $1 WHERE id = $2", [otherOrderItems[0].id, codeId]),
    ).rejects.toThrow(/order_item_id no puede cambiar/);

    const after = await codeSnapshot(codeId);
    expect(after.order_item_id).not.toBe(otherOrderItems[0].id);
  });

  it("el trigger SÍ permite el único avance legítimo: PAID -> DELIVERED", async () => {
    const { order, codeRows } = await payOrder(1, 1);
    const result = await deliverOrderCodes(pool, { orderId: order.orderId, accessToken: order.accessToken! });
    expect(result.codes).toHaveLength(1);

    const after = await codeSnapshot(codeRows[0].id);
    expect(after.status).toBe("DELIVERED");
    expect(after.order_item_id).toBe(codeRows[0].order_item_id);
  });

  it("el trigger rechaza incluso DELIVERED -> AVAILABLE", async () => {
    const { order, codeRows } = await payOrder(1, 1);
    await deliverOrderCodes(pool, { orderId: order.orderId, accessToken: order.accessToken! });

    await expect(
      pool.query("UPDATE codes SET status = 'AVAILABLE', order_item_id = NULL WHERE id = $1", [codeRows[0].id]),
    ).rejects.toThrow();

    const after = await codeSnapshot(codeRows[0].id);
    expect(after.status).toBe("DELIVERED");
  });

  it("releaseReservation (fase 2) sigue sin poder tocar un código ya vendido", async () => {
    // Doble barrera: el propio WHERE de `releaseReservation` ya excluye
    // `order_item_id IS NOT NULL`; el trigger es la segunda.
    const { codeRows } = await payOrder(1, 1);
    const { rows } = await pool.query<{ reservation_id: string }>("SELECT reservation_id FROM codes WHERE id = $1", [
      codeRows[0].id,
    ]);
    const reservationId = rows[0].reservation_id;

    const released = await withTransaction(pool, (tx) => releaseReservation(tx, reservationId));
    expect(released).toBe(0); // el WHERE de la función ya lo excluye

    const after = await codeSnapshot(codeRows[0].id);
    expect(after.status).toBe("PAID");
  });

  it("regresión (auditoría de seguridad): un DELETE directo sobre un código vendido también se rechaza", async () => {
    const { codeRows } = await payOrder(1, 1);

    await expect(pool.query("DELETE FROM codes WHERE id = $1", [codeRows[0].id])).rejects.toThrow(
      /ya está vendido.*no se puede borrar/,
    );

    const after = await codeSnapshot(codeRows[0].id);
    expect(after.status).toBe("PAID"); // sigue ahí, no se borró
  });

  it("un código todavía no vendido (AVAILABLE/RESERVED) sí se puede borrar — el trigger no se pasa de la raya", async () => {
    await seedProduct(pool, { codeCount: 1, productId: "borrable-999" });
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM codes WHERE product_id = $1",
      ["borrable-999"],
    );

    await expect(pool.query("DELETE FROM codes WHERE id = $1", [rows[0].id])).resolves.not.toThrow();

    const { rows: after } = await pool.query("SELECT id FROM codes WHERE id = $1", [rows[0].id]);
    expect(after).toHaveLength(0);
  });
});

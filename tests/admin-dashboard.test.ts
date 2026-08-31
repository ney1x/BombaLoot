import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/server/db/client";
import { getDashboardMetrics } from "@/server/services/admin-dashboard";
import { getHealthReport } from "@/server/services/admin-health";
import { createOpaqueToken, generateOrderNumber } from "@/server/auth/tokens";
import {
  TEST_PRODUCT_ID,
  countByStatus,
  createOrderFromReservation,
  createTestDatabase,
  resetData,
  seedProduct,
} from "./helpers/database";

let pool: Pool;
let db: Db;

beforeAll(async () => {
  pool = await createTestDatabase();
  db = createDb(pool);
}, 120_000);

afterAll(async () => {
  await pool?.end();
});

beforeEach(async () => {
  await resetData(pool);
});

async function insertOrder(overrides: {
  paymentStatus?: string;
  deliveryStatus?: string;
  totalCop?: number;
  paidAt?: Date | null;
}): Promise<string> {
  const { hash } = createOpaqueToken();
  const totalCop = overrides.totalCop ?? 28_400;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO orders
       (order_number, access_token_hash, email, subtotal_cop, discount_cop, total_cop,
        payment_status, delivery_status, paid_at)
     VALUES ($1,$2,'comprador@test.local',$3,0,$3,$4,$5,$6)
     RETURNING id`,
    [
      generateOrderNumber(),
      hash,
      totalCop,
      overrides.paymentStatus ?? "PENDING",
      overrides.deliveryStatus ?? "PENDING",
      overrides.paidAt ?? null,
    ],
  );
  return rows[0].id;
}

/* ═══════════════════════════ getDashboardMetrics ═══════════════════════════ */

describe("getDashboardMetrics", () => {
  it("sin datos, todo en cero", async () => {
    const metrics = await getDashboardMetrics(db);
    expect(metrics).toEqual({
      salesTodayCop: 0,
      salesMonthCop: 0,
      ordersPending: 0,
      ordersPaidToday: 0,
      ordersDeliveryProblems: 0,
      refundsPending: 0,
      refundsManualReview: 0,
      productsLowStock: 0,
      productsOutOfStock: 0,
    });
  });

  it("suma ventas pagadas hoy y del mes, ignora pedidos no pagados", async () => {
    await insertOrder({ paymentStatus: "PAID", paidAt: new Date(), totalCop: 10_000 });
    await insertOrder({ paymentStatus: "PAID", paidAt: new Date(), totalCop: 20_000 });
    await insertOrder({ paymentStatus: "PENDING", totalCop: 99_999 });

    const metrics = await getDashboardMetrics(db);
    expect(metrics.salesTodayCop).toBe(30_000);
    expect(metrics.salesMonthCop).toBe(30_000);
    expect(metrics.ordersPaidToday).toBe(2);
  });

  it("cuenta pedidos pendientes", async () => {
    await insertOrder({ paymentStatus: "PENDING" });
    await insertOrder({ paymentStatus: "PENDING" });
    await insertOrder({ paymentStatus: "PAID", paidAt: new Date() });

    const metrics = await getDashboardMetrics(db);
    expect(metrics.ordersPending).toBe(2);
  });

  it("cuenta pedidos PAID + delivery UNAVAILABLE como problema de entrega", async () => {
    await insertOrder({ paymentStatus: "PAID", deliveryStatus: "UNAVAILABLE", paidAt: new Date() });
    await insertOrder({ paymentStatus: "PAID", deliveryStatus: "DELIVERED", paidAt: new Date() });

    const metrics = await getDashboardMetrics(db);
    expect(metrics.ordersDeliveryProblems).toBe(1);
  });

  it("cuenta refunds pendientes/iniciados y manual review por separado", async () => {
    const orderId = await insertOrder({ paymentStatus: "PAID", deliveryStatus: "UNAVAILABLE", paidAt: new Date() });
    const { rows: piRows } = await pool.query<{ id: string }>(
      `INSERT INTO payment_intents (order_id, provider, status, amount_cop)
       VALUES ($1, 'WOMPI', 'APPROVED', 10000) RETURNING id`,
      [orderId],
    );
    const piId = piRows[0].id;

    await pool.query(
      `INSERT INTO refund_requests (order_id, payment_intent_id, provider, status, provider_request_id, amount_cop, currency)
       VALUES ($1,$2,'WOMPI','PENDING_REFUND','req-1',10000,'COP')`,
      [orderId, piId],
    );
    await pool.query(
      `INSERT INTO refund_requests (order_id, payment_intent_id, provider, status, provider_request_id, amount_cop, currency)
       VALUES ($1,$2,'WOMPI','MANUAL_REVIEW_REQUIRED','req-2',10000,'COP')`,
      [orderId, piId],
    );

    const metrics = await getDashboardMetrics(db);
    expect(metrics.refundsPending).toBe(1);
    expect(metrics.refundsManualReview).toBe(1);
  });

  it("stock bajo/agotado reutiliza el mismo cálculo que el catálogo (listCatalogProducts)", async () => {
    await seedProduct(pool, { productId: `${TEST_PRODUCT_ID}-out`, codeCount: 0 });
    await seedProduct(pool, { productId: `${TEST_PRODUCT_ID}-low`, codeCount: 2 }); // low_stock_at default 5
    await seedProduct(pool, { productId: `${TEST_PRODUCT_ID}-ok`, codeCount: 20 });

    const metrics = await getDashboardMetrics(db);
    expect(metrics.productsOutOfStock).toBe(1);
    expect(metrics.productsLowStock).toBe(1);
  });
});

/* ═══════════════════════════ getHealthReport ═══════════════════════════ */

describe("getHealthReport", () => {
  it("database: OK con latencia medida sobre una consulta real", async () => {
    const health = await getHealthReport(pool);
    expect(health.database.status).toBe("OK");
    expect(typeof health.database.latencyMs).toBe("number");
    expect(health.database.timestamp).toBeTruthy();
  });

  it("inventory: OK sin reservas vencidas atascadas", async () => {
    const health = await getHealthReport(pool);
    expect(health.inventory.status).toBe("OK");
  });

  it("inventory: WARNING con muchas reservas RESERVED vencidas sin recuperar", async () => {
    const { codeIds } = await seedProduct(pool, { codeCount: 51 });
    await pool.query(
      `UPDATE codes SET status = 'RESERVED', reserved_until = now() - interval '10 minutes'
        WHERE id = ANY($1::uuid[])`,
      [codeIds],
    );

    const health = await getHealthReport(pool);
    expect(health.inventory.status).toBe("WARNING");
    expect(health.inventory.message).toContain("códigos reservados vencidos");
  });

  it("webhooks: OK y mensaje explícito cuando no hay eventos todavía", async () => {
    const health = await getHealthReport(pool);
    expect(health.webhooks.status).toBe("OK");
    expect(health.webhooks.message).toContain("Sin webhooks recibidos");
  });

  it("webhooks: ERROR cuando la mayoría de los últimos eventos fallaron", async () => {
    for (let i = 0; i < 10; i += 1) {
      await pool.query(
        `INSERT INTO payment_events (provider, event_id, event_type, status, payload)
         VALUES ('WOMPI', $1, 'transaction.updated', 'REJECTED', '{}'::jsonb)`,
        [`evt-${i}`],
      );
    }

    const health = await getHealthReport(pool);
    expect(health.webhooks.status).toBe("ERROR");
  });

  it("refundWorker: OK sin refunds pendientes", async () => {
    const health = await getHealthReport(pool);
    expect(health.refundWorker.status).toBe("OK");
  });

  it("refundWorker: WARNING cuando hay MANUAL_REVIEW_REQUIRED", async () => {
    const orderId = await insertOrder({ paymentStatus: "PAID", deliveryStatus: "UNAVAILABLE", paidAt: new Date() });
    const { rows: piRows } = await pool.query<{ id: string }>(
      `INSERT INTO payment_intents (order_id, provider, status, amount_cop)
       VALUES ($1, 'WOMPI', 'APPROVED', 10000) RETURNING id`,
      [orderId],
    );
    await pool.query(
      `INSERT INTO refund_requests (order_id, payment_intent_id, provider, status, provider_request_id, amount_cop, currency)
       VALUES ($1,$2,'WOMPI','MANUAL_REVIEW_REQUIRED','req-1',10000,'COP')`,
      [orderId, piRows[0].id],
    );

    const health = await getHealthReport(pool);
    expect(health.refundWorker.status).toBe("WARNING");
    expect(health.refundWorker.message).toContain("revisión manual");
  });

  it("refundWorker: ERROR cuando un REFUND_INITIATED lleva más de 5 min sin reintento", async () => {
    const orderId = await insertOrder({ paymentStatus: "PAID", deliveryStatus: "UNAVAILABLE", paidAt: new Date() });
    const { rows: piRows } = await pool.query<{ id: string }>(
      `INSERT INTO payment_intents (order_id, provider, status, amount_cop)
       VALUES ($1, 'WOMPI', 'APPROVED', 10000) RETURNING id`,
      [orderId],
    );
    await pool.query(
      `INSERT INTO refund_requests
         (order_id, payment_intent_id, provider, status, provider_request_id, amount_cop, currency, initiated_at)
       VALUES ($1,$2,'WOMPI','REFUND_INITIATED','req-1',10000,'COP', now() - interval '10 minutes')`,
      [orderId, piRows[0].id],
    );

    const health = await getHealthReport(pool);
    expect(health.refundWorker.status).toBe("ERROR");
    expect(health.refundWorker.message).toContain("el worker puede no estar corriendo");
  });

  it("payments: refleja configuración real de credenciales, no un ping en vivo", async () => {
    const health = await getHealthReport(pool);
    // El entorno de test define CODE_ENCRYPTION_KEY/FINGERPRINT pero no
    // necesariamente credenciales de Wompi/PayPal — cualquiera de los dos
    // estados es válido acá, lo que se prueba es que el mensaje es honesto.
    expect(["OK", "NOT_CONFIGURED"]).toContain(health.payments.status);
    if (health.payments.status === "OK") {
      expect(health.payments.message).toContain("no se hace ping en vivo");
    } else {
      expect(health.payments.message).toContain("Faltan credenciales");
    }
  });

  it("ningún check expone secretos (env vars con valor, tokens, keys)", async () => {
    const health = await getHealthReport(pool);
    const serialized = JSON.stringify(health);
    expect(serialized).not.toMatch(/sk_|pk_|Bearer |password|secret[a-z]*['":]?\s*['"][^'"]{6,}/i);
  });
});

/* ═══════════════════════════ regresión: fases anteriores intactas ═══════════════════════════ */

describe("regresión — el dashboard no altera datos", () => {
  it("getDashboardMetrics y getHealthReport son de solo lectura: el inventario no cambia", async () => {
    const { productId, codeIds } = await seedProduct(pool, { codeCount: 3 });
    const before = await countByStatus(pool, productId);

    await getDashboardMetrics(db);
    await getHealthReport(pool);

    const after = await countByStatus(pool, productId);
    expect(after).toEqual(before);
    expect(codeIds).toHaveLength(3);
  });

  it("una orden real de checkout (fase 4) sigue contando igual en las métricas", async () => {
    const { productId, codeIds } = await seedProduct(pool, { codeCount: 5 });
    const { rows: reservationRows } = await pool.query<{ id: string }>(
      `INSERT INTO reservations (status, guest_key, expires_at)
       VALUES ('ACTIVE', 'guest-dashboard-test', now() + interval '10 minutes') RETURNING id`,
    );
    const reservationId = reservationRows[0].id;
    await pool.query(
      `UPDATE codes SET status = 'RESERVED', reservation_id = $2, reserved_until = now() + interval '10 minutes'
        WHERE id = ANY($1::uuid[])`,
      [codeIds.slice(0, 2), reservationId],
    );

    const { orderId } = await createOrderFromReservation(pool, {
      reservationId,
      productId,
      quantity: 2,
    });
    await pool.query(
      `UPDATE orders SET payment_status = 'PAID', paid_at = now(), delivery_status = 'PENDING' WHERE id = $1::uuid`,
      [orderId],
    );

    const metrics = await getDashboardMetrics(db);
    expect(metrics.ordersPaidToday).toBe(1);
    expect(metrics.salesTodayCop).toBeGreaterThan(0);
  });
});

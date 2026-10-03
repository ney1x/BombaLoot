import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { checkoutCart, resetIdempotencyCache, type CheckoutOwner } from "@/server/services/checkout-service";
import { resetRateLimits } from "@/server/services/rate-limit";
import { TEST_PRODUCT_ID, createTestDatabase, resetData, seedLoyaltyTiers, seedProduct } from "./helpers/database";

/**
 * `GET /api/orders/token/[accessToken]` con `?email=` — el gate agregado para
 * que "recuperar el pedido desde el historial" (link con el token, pero sin
 * la sesión de checkout viva en `sessionStorage`) pida confirmar el email de
 * la compra antes de devolver el pedido. Ver `OrderDeliveryReal.tsx`.
 *
 * Corre el handler real de la ruta (no una reimplementación de su lógica).
 * `getPool()`/`getDb()` de `src/server/db/client.ts` son un singleton lazy
 * que lee `process.env.DATABASE_URL` en el primer uso — se lo apunta acá a
 * `TEST_DATABASE_URL` (restaurado en `afterAll`) para que el handler real
 * pegue contra la base de test, nunca la de desarrollo.
 */

let pool: Pool;
let originalDatabaseUrl: string | undefined;

beforeAll(async () => {
  originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  pool = await createTestDatabase();
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

beforeEach(async () => {
  await resetData(pool);
  await seedLoyaltyTiers(pool);
  await resetRateLimits(pool);
  resetIdempotencyCache();
});

function guestOwner(overrides: Partial<Extract<CheckoutOwner, { type: "guest" }>> = {}): CheckoutOwner {
  return {
    type: "guest",
    guestKey: overrides.guestKey ?? `guest-${Math.random().toString(36).slice(2)}`,
    email: overrides.email ?? "recovery@test.local",
    name: overrides.name ?? null,
  };
}

async function callRoute(accessToken: string, email?: string) {
  const { GET } = await import("@/app/api/orders/token/[accessToken]/route");
  const { NextRequest } = await import("next/server");
  const url = new URL(`http://localhost:3000/api/orders/token/${encodeURIComponent(accessToken)}`);
  if (email !== undefined) url.searchParams.set("email", email);
  const request = new NextRequest(url);
  const response = await GET(request, { params: Promise.resolve({ accessToken }) });
  const body = await response.json();
  return { status: response.status, body };
}

describe("GET /api/orders/token/[accessToken] — gate de email", () => {
  it("sin ?email (flujo normal recién pagado): funciona igual que antes, sin fricción", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const order = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: crypto.randomUUID(),
      owner: guestOwner({ email: "recovery@test.local" }),
    });

    const { status, body } = await callRoute(order.accessToken!);
    expect(status).toBe(200);
    expect(body.order.orderId).toBe(order.orderId);
  });

  it("?email correcto (case-insensitive): devuelve el pedido", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const order = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: crypto.randomUUID(),
      owner: guestOwner({ email: "Recovery@Test.Local" }),
    });

    const { status, body } = await callRoute(order.accessToken!, "recovery@test.local");
    expect(status).toBe(200);
    expect(body.order.orderId).toBe(order.orderId);
  });

  it("?email incorrecto: 403, nunca el pedido", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const order = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: crypto.randomUUID(),
      owner: guestOwner({ email: "dueño-real@test.local" }),
    });

    const { status, body } = await callRoute(order.accessToken!, "atacante@test.local");
    expect(status).toBe(403);
    expect(body.order).toBeUndefined();
  });

  it("token inválido + email: 404 (nunca 403 — no confirma que el token 'casi' existe)", async () => {
    const { status, body } = await callRoute("token-totalmente-inventado", "cualquiera@test.local");
    expect(status).toBe(404);
    expect(body.order).toBeUndefined();
  });
});

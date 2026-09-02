import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/server/db/client";
import { listCatalogProducts } from "@/server/services/catalog";
import {
  checkoutCart,
  deriveOrderStatus,
  getOrderByAccessToken,
  getOrderForUser,
  listOrdersForUser,
  resetIdempotencyCache,
  sweepExpiredPendingOrders,
  type CheckoutOwner,
} from "@/server/services/checkout-service";
import { checkoutSchema } from "@/server/services/checkout-schemas";
import {
  EmptyCartError,
  InsufficientStockError,
  InvalidProductError,
  InvalidQuantityError,
  QuantityNotAllowedError,
} from "@/server/services/errors";
import { registerUser } from "@/server/services/auth-service";
import { resetRateLimits } from "@/server/services/rate-limit";
import {
  TEST_PRODUCT_ID,
  countByStatus,
  createTestDatabase,
  resetData,
  seedLoyaltyTiers,
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
  await seedLoyaltyTiers(pool);
  await resetRateLimits(pool);
  resetIdempotencyCache();
});

const SECOND_PRODUCT_ID = "roblox-840";

function guestOwner(overrides: Partial<Extract<CheckoutOwner, { type: "guest" }>> = {}): CheckoutOwner {
  return {
    type: "guest",
    guestKey: overrides.guestKey ?? `guest-${Math.random().toString(36).slice(2)}`,
    email: overrides.email ?? "invitado@test.local",
    name: overrides.name ?? null,
  };
}

function uuid(): string {
  return crypto.randomUUID();
}

/* ═══════════════════════════ checkout: invitado y autenticado ═══════════════════════════ */

describe("checkout de invitado", () => {
  it("crea el pedido sin user_id, con email del invitado", async () => {
    await seedProduct(pool, { codeCount: 5 });

    const result = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 2 }],
      idempotencyKey: uuid(),
      owner: guestOwner({ email: "compra@invitado.test" }),
    });

    expect(result.accessToken).not.toBeNull();
    expect(result.email).toBe("compra@invitado.test");
    expect(result.paymentStatus).toBe("PENDING");
    expect(result.deliveryStatus).toBe("PENDING");
    expect(result.discountCop).toBe(0); // sin cuenta, sin nivel de fidelización

    const { rows } = await pool.query<{ user_id: string | null }>(
      "SELECT user_id FROM orders WHERE id = $1",
      [result.orderId],
    );
    expect(rows[0].user_id).toBeNull();
  });
});

describe("checkout autenticado", () => {
  it("asocia el pedido al user_id y aplica el descuento de fidelización real", async () => {
    await seedProduct(pool, { codeCount: 5, priceCop: 100_000 });

    // Silver arranca en 5 compras (ver seed real de loyalty_tiers).
    const { user } = await registerUser(pool, {
      name: "Compradora Fiel",
      email: "fiel@test.local",
      password: "clave-larga-cualquiera-1",
    }, {});
    await pool.query("UPDATE users SET purchases_count = 5 WHERE id = $1", [user.id]);

    const result = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner: { type: "user", userId: user.id, email: user.email, name: user.name, purchasesCount: 5 },
    });

    expect(result.discountCop).toBeGreaterThan(0);
    expect(result.discountLabel).toMatch(/Silver/);
    expect(result.totalCop).toBe(result.subtotalCop - result.discountCop);

    const { rows } = await pool.query<{ user_id: string }>("SELECT user_id FROM orders WHERE id = $1", [
      result.orderId,
    ]);
    expect(rows[0].user_id).toBe(user.id);
  });

  it("un usuario sin compras previas (Bronze) no tiene descuento", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const { user } = await registerUser(
      pool,
      { name: "Nueva", email: "nueva@test.local", password: "clave-larga-cualquiera-2" },
      {},
    );

    const result = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner: { type: "user", userId: user.id, email: user.email, name: user.name, purchasesCount: 0 },
    });

    // Bronze (0 compras mínimas, 0% descuento) SÍ se resuelve como nivel —
    // todo comprador tiene un nivel, igual que ya lo muestra /cuenta — pero
    // no descuenta nada.
    expect(result.discountCop).toBe(0);
    expect(result.discountLabel).toBe("Bronze · 0%");
    expect(result.totalCop).toBe(result.subtotalCop);
  });
});

/* ═══════════════════════════ validación server-side ═══════════════════════════ */

describe("el servidor nunca confía en lo que manda el cliente", () => {
  it("product_id inexistente: rechaza todo el checkout, no solo la línea", async () => {
    await seedProduct(pool, { codeCount: 5 });

    await expect(
      checkoutCart(pool, {
        lines: [
          { productId: TEST_PRODUCT_ID, quantity: 1 },
          { productId: "producto-que-no-existe", quantity: 1 },
        ],
        idempotencyKey: uuid(),
        owner: guestOwner(),
      }),
    ).rejects.toBeInstanceOf(InvalidProductError);

    // Todo o nada: el producto válido tampoco quedó reservado.
    expect(await countByStatus(pool, TEST_PRODUCT_ID)).toEqual({ AVAILABLE: 5 });
  });

  it("producto inactivo: mismo error que uno inexistente", async () => {
    await seedProduct(pool, { codeCount: 5 });
    await pool.query("UPDATE products SET is_active = false WHERE id = $1", [TEST_PRODUCT_ID]);

    try {
      await expect(
        checkoutCart(pool, {
          lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
          idempotencyKey: uuid(),
          owner: guestOwner(),
        }),
      ).rejects.toBeInstanceOf(InvalidProductError);
    } finally {
      // `products`/`games` NO se truncan entre tests (a propósito, en
      // `resetData`) — sin restaurar esto acá, todos los tests siguientes
      // del archivo heredarían un producto desactivado.
      await pool.query("UPDATE products SET is_active = true WHERE id = $1", [TEST_PRODUCT_ID]);
    }
  });

  it("cantidad negativa o cero: rechazada antes de tocar inventario", async () => {
    await seedProduct(pool, { codeCount: 5 });

    for (const quantity of [0, -1, -100]) {
      await expect(
        checkoutCart(pool, {
          lines: [{ productId: TEST_PRODUCT_ID, quantity }],
          idempotencyKey: uuid(),
          owner: guestOwner(),
        }),
      ).rejects.toBeInstanceOf(InvalidQuantityError);
    }

    expect(await countByStatus(pool, TEST_PRODUCT_ID)).toEqual({ AVAILABLE: 5 });
  });

  it("cantidad no entera: rechazada", async () => {
    await seedProduct(pool, { codeCount: 5 });
    await expect(
      checkoutCart(pool, {
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1.5 }],
        idempotencyKey: uuid(),
        owner: guestOwner(),
      }),
    ).rejects.toBeInstanceOf(InvalidQuantityError);
  });

  it("cantidad absurdamente grande: el schema Zod la corta en el borde HTTP", () => {
    const parsed = checkoutSchema.safeParse({
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 999_999 }],
      idempotencyKey: uuid(),
      buyerEmail: "x@test.local",
    });
    expect(parsed.success).toBe(false);
  });

  it("cantidad por encima de max_per_order del producto: rechazada aunque haya stock físico", async () => {
    await seedProduct(pool, { codeCount: 50, maxPerOrder: 3 });
    await expect(
      checkoutCart(pool, {
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 4 }],
        idempotencyKey: uuid(),
        owner: guestOwner(),
      }),
    ).rejects.toBeInstanceOf(QuantityNotAllowedError);
  });

  it("stock insuficiente: rechaza y no deja nada reservado", async () => {
    await seedProduct(pool, { codeCount: 2 });
    await expect(
      checkoutCart(pool, {
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 5 }],
        idempotencyKey: uuid(),
        owner: guestOwner(),
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    expect(await countByStatus(pool, TEST_PRODUCT_ID)).toEqual({ AVAILABLE: 2 });
  });

  it("carrito vacío: rechazado antes de cualquier trabajo", async () => {
    await expect(
      checkoutCart(pool, { lines: [], idempotencyKey: uuid(), owner: guestOwner() }),
    ).rejects.toBeInstanceOf(EmptyCartError);
  });

  it("precio y descuento manipulados: el schema los ignora — no existen como campo de entrada", () => {
    const parsed = checkoutSchema.parse({
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      buyerEmail: "x@test.local",
      // Campos que un cliente malicioso podría intentar colar:
      unitPriceCop: 1,
      discountCop: 999_999,
      totalCop: 1,
      discountPct: 100,
    });
    expect(parsed).not.toHaveProperty("unitPriceCop");
    expect(parsed).not.toHaveProperty("discountCop");
    expect(parsed).not.toHaveProperty("totalCop");
    expect(parsed).not.toHaveProperty("discountPct");
  });

  it("el total siempre sale de multiplicar el precio real por la cantidad real", async () => {
    await seedProduct(pool, { codeCount: 5, priceCop: 12_345 });
    const result = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 3 }],
      idempotencyKey: uuid(),
      owner: guestOwner(),
    });
    expect(result.subtotalCop).toBe(12_345 * 3);
    expect(result.totalCop).toBe(12_345 * 3);
  });
});

/* ═══════════════════════════ reserva ═══════════════════════════ */

describe("reserva creada por el checkout", () => {
  it("dura ~30 minutos y esa fecha vive en Postgres, no en el navegador", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const before = Date.now();

    const result = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner: guestOwner(),
    });

    const expiresInMs = result.paymentExpiresAt.getTime() - before;
    expect(expiresInMs).toBeGreaterThan(29 * 60 * 1000);
    expect(expiresInMs).toBeLessThan(31 * 60 * 1000);

    const { rows } = await pool.query<{ payment_expires_at: string }>(
      "SELECT payment_expires_at FROM orders WHERE id = $1",
      [result.orderId],
    );
    expect(rows[0].payment_expires_at).toBeTruthy();
  });

  it("reserva de múltiples productos: cada línea reclama sus propios códigos", async () => {
    await seedProduct(pool, { codeCount: 3 });
    await seedProduct(pool, { productId: SECOND_PRODUCT_ID, gameId: "roblox", codeCount: 3 });

    const result = await checkoutCart(pool, {
      lines: [
        { productId: TEST_PRODUCT_ID, quantity: 2 },
        { productId: SECOND_PRODUCT_ID, quantity: 1 },
      ],
      idempotencyKey: uuid(),
      owner: guestOwner(),
    });

    expect(result.items).toHaveLength(2);
    expect(await countByStatus(pool, TEST_PRODUCT_ID)).toEqual({ RESERVED: 2, AVAILABLE: 1 });
    expect(await countByStatus(pool, SECOND_PRODUCT_ID)).toEqual({ RESERVED: 1, AVAILABLE: 2 });

    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM order_items WHERE order_id = $1",
      [result.orderId],
    );
    expect(Number(rows[0].count)).toBe(2);
  });

  it("dos líneas del mismo producto se funden en una sola (sin romper el UNIQUE de order_items)", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const result = await checkoutCart(pool, {
      lines: [
        { productId: TEST_PRODUCT_ID, quantity: 1 },
        { productId: TEST_PRODUCT_ID, quantity: 2 },
      ],
      idempotencyKey: uuid(),
      owner: guestOwner(),
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(3);
  });
});

/* ═══════════════════════════ idempotencia ═══════════════════════════ */

describe("idempotencia: doble clic, retry, request duplicada", () => {
  it("doble clic (dos requests concurrentes, misma idempotencyKey): un solo pedido", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const idempotencyKey = uuid();
    const owner = guestOwner();

    const [a, b] = await Promise.all([
      checkoutCart(pool, { lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }], idempotencyKey, owner }),
      checkoutCart(pool, { lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }], idempotencyKey, owner }),
    ]);

    expect(a.orderId).toBe(b.orderId);
    expect(a.orderNumber).toBe(b.orderNumber);

    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM orders WHERE idempotency_key = $1",
      [idempotencyKey],
    );
    expect(Number(rows[0].count)).toBe(1);

    // Y solo se reservó UNA vez — el doble clic no reclamó el doble de códigos.
    expect(await countByStatus(pool, TEST_PRODUCT_ID)).toEqual({ RESERVED: 1, AVAILABLE: 4 });
  });

  it("retry secuencial con la misma clave: devuelve el mismo pedido con el token real (caché en memoria)", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const idempotencyKey = uuid();
    const owner = guestOwner();
    const params = { lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }], idempotencyKey, owner };

    const first = await checkoutCart(pool, params);
    const retry = await checkoutCart(pool, params);

    expect(retry.orderId).toBe(first.orderId);
    expect(retry.idempotent).toBe(true);
    expect(retry.accessToken).toBe(first.accessToken); // servido desde la caché, token real
  });

  it("retry después de perder la caché (otro proceso): mismo pedido, sin poder repetir el token en claro", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const idempotencyKey = uuid();
    const owner = guestOwner();
    const params = { lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }], idempotencyKey, owner };

    const first = await checkoutCart(pool, params);
    resetIdempotencyCache(); // simula un proceso/instancia distinta

    const retry = await checkoutCart(pool, params);
    expect(retry.orderId).toBe(first.orderId);
    expect(retry.idempotent).toBe(true);
    expect(retry.accessToken).toBeNull(); // honesto: no se puede reconstruir el token, solo el hash vive en la base

    // Pero el pedido real sigue siendo accesible con el token que sí se
    // entregó en la respuesta original.
    const byToken = await getOrderByAccessToken(pool, first.accessToken!);
    expect(byToken?.orderId).toBe(first.orderId);
  });

  it("una clave distinta SÍ crea un pedido nuevo (no es un checkout duplicado real)", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const owner = guestOwner();

    const a = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner,
    });
    const b = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner,
    });

    expect(a.orderId).not.toBe(b.orderId);
  });

  it("timeout del cliente: si la primera request en verdad falló (producto inválido), " +
    "un retry con la MISMA clave puede intentar de nuevo — no queda 'atascada'", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const idempotencyKey = uuid();
    const owner = guestOwner();

    await expect(
      checkoutCart(pool, {
        lines: [{ productId: "no-existe", quantity: 1 }],
        idempotencyKey,
        owner,
      }),
    ).rejects.toBeInstanceOf(InvalidProductError);

    // Como el INSERT nunca llegó a pasar, no hay fila con esa idempotency_key
    // — el reintento con datos corregidos sí puede crear el pedido.
    const retry = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey,
      owner,
    });
    expect(retry.idempotent).toBe(false);
    expect(retry.items[0].productId).toBe(TEST_PRODUCT_ID);
  });
});

/* ═══════════════════════════ acceso a pedidos: propio, ajeno, token de invitado ═══════════════════════════ */

describe("acceso a pedidos", () => {
  it("un usuario puede ver su propio pedido", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const { user } = await registerUser(
      pool,
      { name: "Dueña", email: "duena@test.local", password: "clave-larga-cualquiera-3" },
      {},
    );
    const order = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner: { type: "user", userId: user.id, email: user.email, name: user.name, purchasesCount: 0 },
    });

    const view = await getOrderForUser(pool, user.id, order.orderId);
    expect(view?.orderId).toBe(order.orderId);
  });

  it("IDOR: un usuario NO puede ver el pedido de otro — mismo resultado que 'no existe'", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const owner = await registerUser(
      pool,
      { name: "Dueña", email: "duena2@test.local", password: "clave-larga-cualquiera-4" },
      {},
    );
    const attacker = await registerUser(
      pool,
      { name: "Atacante", email: "atacante@test.local", password: "clave-larga-cualquiera-5" },
      {},
    );
    const order = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner: {
        type: "user",
        userId: owner.user.id,
        email: owner.user.email,
        name: owner.user.name,
        purchasesCount: 0,
      },
    });

    const asAttacker = await getOrderForUser(pool, attacker.user.id, order.orderId);
    const nonExistent = await getOrderForUser(pool, attacker.user.id, crypto.randomUUID());
    expect(asAttacker).toBeNull();
    expect(nonExistent).toBeNull();
    expect(asAttacker).toEqual(nonExistent);
  });

  it("listOrdersForUser solo trae los pedidos de ese usuario", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const a = await registerUser(pool, { name: "A", email: "a@test.local", password: "clave-larga-1a" }, {});
    const b = await registerUser(pool, { name: "B", email: "b@test.local", password: "clave-larga-1b" }, {});

    await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner: { type: "user", userId: a.user.id, email: a.user.email, name: a.user.name, purchasesCount: 0 },
    });
    await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner: { type: "user", userId: b.user.id, email: b.user.email, name: b.user.name, purchasesCount: 0 },
    });

    const listA = await listOrdersForUser(pool, a.user.id);
    expect(listA).toHaveLength(1);
    expect(listA[0].userId).toBe(a.user.id);
  });

  it("token de invitado válido: da acceso sin cuenta", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const order = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner: guestOwner({ email: "token@test.local" }),
    });

    const view = await getOrderByAccessToken(pool, order.accessToken!);
    expect(view?.orderId).toBe(order.orderId);
    expect(view?.email).toBe("token@test.local");
  });

  it("token de invitado inválido: null, no un error que confirme que 'casi' existe", async () => {
    await expect(getOrderByAccessToken(pool, "token-totalmente-inventado")).resolves.toBeNull();
  });

  it("order_number NO sirve como credencial", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const order = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner: guestOwner(),
    });

    // Intentar "acceder" usando el order_number como si fuera el token.
    await expect(getOrderByAccessToken(pool, order.orderNumber)).resolves.toBeNull();
  });
});

/* ═══════════════════════════ expiración de reserva / pedido abandonado ═══════════════════════════ */

describe("expiración de la reserva de un pedido", () => {
  it("deriveOrderStatus reporta vencido en el momento de leer, sin depender del barrido", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const order = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner: guestOwner(),
    });

    expect(deriveOrderStatus({
      paymentStatus: order.paymentStatus,
      deliveryStatus: order.deliveryStatus,
      paymentExpiresAt: order.paymentExpiresAt,
    })).toBe("PENDING_PAYMENT");

    expect(deriveOrderStatus({
      paymentStatus: "PENDING",
      deliveryStatus: "PENDING",
      paymentExpiresAt: new Date(Date.now() - 1000),
    })).toBe("PAYMENT_EXPIRED");
  });

  it("el barrido libera los códigos de un pedido abandonado y lo marca FAILED", async () => {
    await seedProduct(pool, { codeCount: 1 });
    const order = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner: guestOwner(),
    });

    await pool.query("UPDATE orders SET payment_expires_at = now() - interval '1 second' WHERE id = $1", [
      order.orderId,
    ]);

    const swept = await sweepExpiredPendingOrders(pool);
    expect(swept.ordersExpired).toBe(1);
    expect(swept.codesReleased).toBe(1);

    expect(await countByStatus(pool, TEST_PRODUCT_ID)).toEqual({ AVAILABLE: 1 });

    const { rows } = await pool.query<{ payment_status: string }>(
      "SELECT payment_status FROM orders WHERE id = $1",
      [order.orderId],
    );
    expect(rows[0].payment_status).toBe("FAILED");

    // El siguiente comprador puede llevarse ese mismo código.
    const nextOrder = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner: guestOwner(),
    });
    expect(nextOrder.items[0].quantity).toBe(1);
  });

  it("el barrido NO toca pedidos ya pagados aunque su ventana original haya vencido", async () => {
    await seedProduct(pool, { codeCount: 1 });
    const order = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner: guestOwner(),
    });

    await pool.query(
      "UPDATE orders SET payment_status = 'PAID', paid_at = now(), payment_expires_at = now() - interval '1 second' WHERE id = $1",
      [order.orderId],
    );

    const swept = await sweepExpiredPendingOrders(pool);
    expect(swept.ordersExpired).toBe(0);
    expect(await countByStatus(pool, TEST_PRODUCT_ID)).toEqual({ RESERVED: 1 });
  });
});

/* ═══════════════════════════ auditoría ═══════════════════════════ */

describe("auditoría del checkout", () => {
  it("order.created queda registrado, sin secretos", async () => {
    await seedProduct(pool, { codeCount: 5 });
    const order = await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner: guestOwner(),
    });

    const { rows } = await pool.query<{ metadata: unknown }>(
      "SELECT metadata FROM audit_logs WHERE action = 'order.created' AND entity_id = $1",
      [order.orderId],
    );
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0].metadata)).not.toMatch(/\b[A-Z]{2,4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/);
  });

  it("el ciclo reserva→asigna también queda auditado (code.reserved, code.assigned)", async () => {
    await seedProduct(pool, { codeCount: 5 });
    await checkoutCart(pool, {
      lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      idempotencyKey: uuid(),
      owner: guestOwner(),
    });

    // El reclamo audita contra la reserva y contra el order_item, no contra
    // la orden — se valida que existan, no que cuelguen del mismo entity_id.
    const { rows: reserved } = await pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM audit_logs WHERE action = 'code.reserved'",
    );
    const { rows: assigned } = await pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM audit_logs WHERE action = 'code.assigned'",
    );
    expect(Number(reserved[0].count)).toBeGreaterThan(0);
    expect(Number(assigned[0].count)).toBeGreaterThan(0);
  });
});

/* ═══════════════════════════ catálogo real ═══════════════════════════ */

describe("catálogo conectado a Postgres", () => {
  it("refleja disponibilidad real, no un mock", async () => {
    // low_stock_at por defecto es 5 — con 10 códigos queda claramente por
    // encima del umbral de "ÚLTIMAS", que se prueba aparte.
    await seedProduct(pool, { codeCount: 10, priceCop: 55_000 });
    const products = await listCatalogProducts(db);
    const product = products.find((p) => p.id === TEST_PRODUCT_ID);

    expect(product?.priceCop).toBe(55_000);
    expect(product?.available).toBe(10);
    expect(product?.stock).toBe("available");
  });

  it("por debajo del umbral de low_stock_at aparece como 'low', no 'available'", async () => {
    await seedProduct(pool, { codeCount: 3 }); // default low_stock_at = 5
    const products = await listCatalogProducts(db);
    expect(products.find((p) => p.id === TEST_PRODUCT_ID)?.stock).toBe("low");
  });

  it("un producto sin stock aparece como agotado, no desaparece del catálogo", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const products = await listCatalogProducts(db);
    const product = products.find((p) => p.id === TEST_PRODUCT_ID);
    expect(product?.stock).toBe("out");
  });

  it("un producto inactivo no aparece en el catálogo", async () => {
    await seedProduct(pool, { codeCount: 5 });
    await pool.query("UPDATE products SET is_active = false WHERE id = $1", [TEST_PRODUCT_ID]);
    try {
      const products = await listCatalogProducts(db);
      expect(products.find((p) => p.id === TEST_PRODUCT_ID)).toBeUndefined();
    } finally {
      await pool.query("UPDATE products SET is_active = true WHERE id = $1", [TEST_PRODUCT_ID]);
    }
  });
});

/* ═══════════════════════════ regresión ═══════════════════════════ */

describe("regresión: fases anteriores siguen intactas", () => {
  it("el reclamo de inventario de fase 2 sigue funcionando igual bajo concurrencia real", async () => {
    await seedProduct(pool, { codeCount: 1 });
    const results = await Promise.allSettled([
      checkoutCart(pool, {
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
        idempotencyKey: uuid(),
        owner: guestOwner(),
      }),
      checkoutCart(pool, {
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
        idempotencyKey: uuid(),
        owner: guestOwner(),
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
});

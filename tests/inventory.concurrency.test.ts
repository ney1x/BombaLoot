import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { beginTransaction, createDb, withTransaction, type Db } from "@/server/db/client";
import { InsufficientStockError } from "@/server/services/errors";
import {
  createReservation,
  getAvailability,
  markOrderCodesPaid,
  sweepExpiredReservations,
} from "@/server/services/inventory";
import {
  TEST_PRODUCT_ID,
  countByStatus,
  createOrderFromReservation,
  createTestDatabase,
  expireCodes,
  resetData,
  seedProduct,
} from "./helpers/database";

/**
 * Prueba de concurrencia del inventario.
 *
 * Corre contra un Postgres real (docker-compose.yml) porque es la única forma
 * de que `FOR UPDATE SKIP LOCKED` signifique algo: hacen falta transacciones
 * simultáneas de verdad. Un motor embebido de una sola conexión daría verde sin
 * probar nada.
 *
 * La contención es estructural, no una carrera de suerte: todas las
 * transacciones se abren primero, compiten después, y ninguna confirma hasta
 * que todas intentaron. El perdedor se topa sí o sí con la fila bloqueada.
 */

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

async function availability(productId = TEST_PRODUCT_ID): Promise<number> {
  return (await getAvailability(db, [productId])).get(productId) ?? 0;
}

describe("dos clientes contra el último código", () => {
  it("con 1 código y 12 compradores simultáneos, exactamente 1 gana", async () => {
    const BUYERS = 12;
    await seedProduct(pool, { codeCount: 1 });

    // 1 · Abrir las 12 transacciones ANTES de que ninguna reclame.
    const handles = await Promise.all(
      Array.from({ length: BUYERS }, () => beginTransaction(pool)),
    );

    // 2 · Reclamar todas a la vez. Nadie confirmó todavía, así que la fila del
    //     ganador está bloqueada mientras los demás la intentan.
    const results = await Promise.allSettled(
      handles.map((handle, i) =>
        createReservation(handle.db, {
          owner: { guestKey: `comprador-${i}` },
          lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
        }),
      ),
    );

    // 3 · Confirmar al ganador, revertir a los perdedores.
    for (const [i, result] of results.entries()) {
      if (result.status === "fulfilled") await handles[i].commit();
      else await handles[i].rollback();
      handles[i].release();
    }

    const winners = results.filter((r) => r.status === "fulfilled");
    const losers = results.filter((r) => r.status === "rejected");

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(BUYERS - 1);

    for (const loser of losers) {
      expect(loser.reason).toBeInstanceOf(InsufficientStockError);
      expect(loser.reason.claimed).toBe(0);
      expect(loser.reason.requested).toBe(1);
    }

    // El código quedó tomado por el ganador y por nadie más.
    expect(await countByStatus(pool, TEST_PRODUCT_ID)).toEqual({ RESERVED: 1 });
    expect(await availability()).toBe(0);

    // Y los perdedores no dejaron reservas vivas detrás.
    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM reservations WHERE status = 'ACTIVE'",
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it("con 5 códigos y 20 compradores, ganan exactamente 5 y sin repetir código", async () => {
    const STOCK = 5;
    const BUYERS = 20;
    await seedProduct(pool, { codeCount: STOCK });

    const handles = await Promise.all(
      Array.from({ length: BUYERS }, () => beginTransaction(pool)),
    );

    const results = await Promise.allSettled(
      handles.map((handle, i) =>
        createReservation(handle.db, {
          owner: { guestKey: `comprador-${i}` },
          lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
        }),
      ),
    );

    for (const [i, result] of results.entries()) {
      if (result.status === "fulfilled") await handles[i].commit();
      else await handles[i].rollback();
      handles[i].release();
    }

    const claimedCodeIds = results
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => r.value.codesByProduct[TEST_PRODUCT_ID]);

    expect(claimedCodeIds).toHaveLength(STOCK);
    // Jamás dos compradores sobre el mismo código.
    expect(new Set(claimedCodeIds).size).toBe(STOCK);
    expect(await availability()).toBe(0);
  });

  it("una reserva parcial no deja códigos tomados: es todo o nada", async () => {
    await seedProduct(pool, { codeCount: 3 });

    // Se piden 5 y solo hay 3: debe fallar sin quedarse con los 3.
    await expect(
      withTransaction(pool, (tx) =>
        createReservation(tx, {
          owner: { guestKey: "ambicioso" },
          lines: [{ productId: TEST_PRODUCT_ID, quantity: 5 }],
        }),
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    expect(await availability()).toBe(3);
    expect(await countByStatus(pool, TEST_PRODUCT_ID)).toEqual({ AVAILABLE: 3 });
  });
});

describe("reservas vencidas", () => {
  it("vuelven a estar disponibles sin que corra el cron", async () => {
    const { codeIds } = await seedProduct(pool, { codeCount: 1 });

    const first = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "abandona" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      }),
    );
    expect(await availability()).toBe(0);

    // El comprador cierra el navegador y la reserva vence.
    await expireCodes(pool, first.codesByProduct[TEST_PRODUCT_ID]);

    // Sin barrido de por medio, el código ya vuelve a contar como disponible…
    expect(await availability()).toBe(1);

    // …y el siguiente comprador se lleva exactamente esa misma fila.
    const second = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "aprovecha" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      }),
    );

    expect(second.codesByProduct[TEST_PRODUCT_ID]).toEqual(codeIds);
    expect(await availability()).toBe(0);
  });

  it("el barrido es mantenimiento, no un requisito de corrección", async () => {
    await seedProduct(pool, { codeCount: 1 });

    const reservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "abandona" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      }),
    );
    await expireCodes(pool, reservation.codesByProduct[TEST_PRODUCT_ID]);

    // El reclamo ya funcionaba sin él; el barrido solo normaliza el estado.
    const swept = await sweepExpiredReservations(db);
    expect(swept.codesReleased).toBe(1);
    expect(swept.reservationsExpired).toBe(1);
    expect(await countByStatus(pool, TEST_PRODUCT_ID)).toEqual({ AVAILABLE: 1 });
  });
});

describe("códigos ya comprometidos con un pedido", () => {
  it("el barrido no los libera aunque la reserva haya vencido", async () => {
    await seedProduct(pool, { codeCount: 1 });

    const reservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "paga" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      }),
    );

    const order = await createOrderFromReservation(pool, {
      reservationId: reservation.reservationId,
      productId: TEST_PRODUCT_ID,
      quantity: 1,
    });

    // El cliente está en la pasarela y el reloj de la reserva vence.
    await expireCodes(pool, order.codeIds);

    const swept = await sweepExpiredReservations(db);
    expect(swept.codesReleased).toBe(0);

    // Sigue atado al pedido: nadie más puede tomarlo.
    expect(await availability()).toBe(0);
    await expect(
      withTransaction(pool, (tx) =>
        createReservation(tx, {
          owner: { guestKey: "intruso" },
          lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
        }),
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it("un código asignado y pagado nunca vuelve a estar disponible", async () => {
    await seedProduct(pool, { codeCount: 1 });

    const reservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "paga" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      }),
    );

    const order = await createOrderFromReservation(pool, {
      reservationId: reservation.reservationId,
      productId: TEST_PRODUCT_ID,
      quantity: 1,
    });

    await withTransaction(pool, (tx) => markOrderCodesPaid(tx, order.orderId));
    expect(await countByStatus(pool, TEST_PRODUCT_ID)).toEqual({ PAID: 1 });

    // Ni el conteo, ni el reclamo, ni el barrido lo devuelven al inventario.
    expect(await availability()).toBe(0);
    await expect(
      withTransaction(pool, (tx) =>
        createReservation(tx, {
          owner: { guestKey: "intruso" },
          lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
        }),
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    expect((await sweepExpiredReservations(db)).codesReleased).toBe(0);
    expect(await countByStatus(pool, TEST_PRODUCT_ID)).toEqual({ PAID: 1 });
  });

  it("dos pedidos simultáneos sobre la misma reserva no duplican el código", async () => {
    await seedProduct(pool, { codeCount: 1 });

    const reservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "doble-clic" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      }),
    );

    // El comprador hace doble clic en "Continuar al pago".
    const attempts = await Promise.allSettled([
      createOrderFromReservation(pool, {
        reservationId: reservation.reservationId,
        productId: TEST_PRODUCT_ID,
        quantity: 1,
      }),
      createOrderFromReservation(pool, {
        reservationId: reservation.reservationId,
        productId: TEST_PRODUCT_ID,
        quantity: 1,
      }),
    ]);

    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);

    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(DISTINCT order_item_id) AS count FROM codes WHERE order_item_id IS NOT NULL",
    );
    expect(Number(rows[0].count)).toBe(1);
  });
});

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, withTransaction, type Db } from "@/server/db/client";
import { InsufficientStockError } from "@/server/services/errors";
import { createReservation, getAvailability, releaseReservation } from "@/server/services/inventory";
import {
  TEST_PRODUCT_ID,
  countByStatus,
  createTestDatabase,
  resetData,
  seedCodesWithBatch,
  seedProduct,
  seedTestUser,
} from "./helpers/database";

/**
 * Vigencia (corte de 90 días, configurable en `code_lifecycle_settings`) y
 * equidad entre admins (`claimCodesForProduct` en `inventory.ts`). Usa los
 * valores default sembrados por la migración 0023: expiry=90, risk=70,
 * fairness_gap=45.
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

async function availability(): Promise<number> {
  return (await getAvailability(db, [TEST_PRODUCT_ID])).get(TEST_PRODUCT_ID) ?? 0;
}

async function uploaderOf(codeId: string): Promise<string | null> {
  const { rows } = await pool.query<{ uploaded_by: string | null }>(
    `SELECT b.uploaded_by FROM codes c LEFT JOIN code_batches b ON b.id = c.batch_id WHERE c.id = $1::uuid`,
    [codeId],
  );
  return rows[0]?.uploaded_by ?? null;
}

/** Reclama `quantity`, devuelve los códigos, y libera enseguida para que el pool quede como estaba (permite repetir el mismo escenario muchas veces). */
async function claimAndRelease(quantity: number): Promise<string[]> {
  const guestKey = `guest-${Math.random().toString(36).slice(2)}`;
  const reservation = await withTransaction(pool, (tx) =>
    createReservation(tx, { owner: { guestKey }, lines: [{ productId: TEST_PRODUCT_ID, quantity }] }),
  );
  const codeIds = reservation.codesByProduct[TEST_PRODUCT_ID];
  await withTransaction(pool, (tx) => releaseReservation(tx, reservation.reservationId));
  return codeIds;
}

describe("corte de vigencia (90 días)", () => {
  it("un código de 91+ días no cuenta como disponible ni se puede reclamar", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const adminId = await seedTestUser(pool, "admin1@test.local");
    await seedCodesWithBatch(pool, { productId: TEST_PRODUCT_ID, uploadedBy: adminId, count: 1, ageDays: 91 });

    expect(await availability()).toBe(0);
    await expect(
      withTransaction(pool, (tx) =>
        createReservation(tx, {
          owner: { guestKey: "comprador" },
          lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
        }),
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it("un código de 89 días sigue disponible", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const adminId = await seedTestUser(pool, "admin1@test.local");
    await seedCodesWithBatch(pool, { productId: TEST_PRODUCT_ID, uploadedBy: adminId, count: 1, ageDays: 89 });

    expect(await availability()).toBe(1);
  });
});

describe("equidad entre admins", () => {
  it("comprar 2 de un pool de 2+2 (edades parejas) da exactamente 1 de cada admin", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const admin1 = await seedTestUser(pool, "admin1@test.local");
    const admin2 = await seedTestUser(pool, "admin2@test.local");
    await seedCodesWithBatch(pool, { productId: TEST_PRODUCT_ID, uploadedBy: admin1, count: 2, ageDays: 10 });
    await seedCodesWithBatch(pool, { productId: TEST_PRODUCT_ID, uploadedBy: admin2, count: 2, ageDays: 8 });

    const reservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "comprador" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 2 }],
      }),
    );
    const uploaders = await Promise.all(reservation.codesByProduct[TEST_PRODUCT_ID].map(uploaderOf));

    expect(uploaders.sort()).toEqual([admin1, admin2].sort());
  });

  it("comprar 3 de un pool de 2+2 da un reparto 2-1, sin admin fijo para el extra", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const admin1 = await seedTestUser(pool, "admin1@test.local");
    const admin2 = await seedTestUser(pool, "admin2@test.local");
    await seedCodesWithBatch(pool, { productId: TEST_PRODUCT_ID, uploadedBy: admin1, count: 2, ageDays: 10 });
    await seedCodesWithBatch(pool, { productId: TEST_PRODUCT_ID, uploadedBy: admin2, count: 2, ageDays: 8 });

    const reservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "comprador" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 3 }],
      }),
    );
    const uploaders = await Promise.all(reservation.codesByProduct[TEST_PRODUCT_ID].map(uploaderOf));
    const countAdmin1 = uploaders.filter((u) => u === admin1).length;
    const countAdmin2 = uploaders.filter((u) => u === admin2).length;

    expect([countAdmin1, countAdmin2].sort()).toEqual([1, 2]);
  });

  it("un solo admin con stock se comporta como FIFO normal", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const admin1 = await seedTestUser(pool, "admin1@test.local");
    const older = await seedCodesWithBatch(pool, {
      productId: TEST_PRODUCT_ID,
      uploadedBy: admin1,
      count: 1,
      ageDays: 20,
    });
    await seedCodesWithBatch(pool, { productId: TEST_PRODUCT_ID, uploadedBy: admin1, count: 1, ageDays: 5 });

    const reservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "comprador" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      }),
    );
    expect(reservation.codesByProduct[TEST_PRODUCT_ID]).toEqual(older);
  });

  it("margen de 45 días: una diferencia de 60 días siempre gana el más viejo, sin importar admin", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const admin1 = await seedTestUser(pool, "admin1@test.local");
    const admin2 = await seedTestUser(pool, "admin2@test.local");
    await seedCodesWithBatch(pool, { productId: TEST_PRODUCT_ID, uploadedBy: admin1, count: 1, ageDays: 80 });
    await seedCodesWithBatch(pool, { productId: TEST_PRODUCT_ID, uploadedBy: admin2, count: 1, ageDays: 20 });

    for (let i = 0; i < 15; i += 1) {
      const [codeId] = await claimAndRelease(1);
      expect(await uploaderOf(codeId)).toBe(admin1);
    }
  });

  it("margen de 45 días: una diferencia de 30 días queda dentro del margen y sortea entre admins", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const admin1 = await seedTestUser(pool, "admin1@test.local");
    const admin2 = await seedTestUser(pool, "admin2@test.local");
    await seedCodesWithBatch(pool, { productId: TEST_PRODUCT_ID, uploadedBy: admin1, count: 1, ageDays: 80 });
    await seedCodesWithBatch(pool, { productId: TEST_PRODUCT_ID, uploadedBy: admin2, count: 1, ageDays: 50 });

    const seen = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      const [codeId] = await claimAndRelease(1);
      seen.add((await uploaderOf(codeId)) ?? "");
    }

    expect(seen).toEqual(new Set([admin1, admin2]));
  });
});

describe("getAvailability", () => {
  it("no cuenta códigos de otro producto ni códigos vencidos", async () => {
    await seedProduct(pool, { codeCount: 2 });
    const adminId = await seedTestUser(pool, "admin1@test.local");
    await seedCodesWithBatch(pool, { productId: TEST_PRODUCT_ID, uploadedBy: adminId, count: 1, ageDays: 95 });

    expect(await availability()).toBe(2);
    expect(await countByStatus(pool, TEST_PRODUCT_ID)).toMatchObject({ AVAILABLE: 3 });
  });
});

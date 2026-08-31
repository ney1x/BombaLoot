import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, withTransaction, type Db } from "@/server/db/client";
import { encryptCode } from "@/server/crypto/codes";
import { writeAudit } from "@/server/services/audit";
import { QuantityNotAllowedError } from "@/server/services/errors";
import { createReservation } from "@/server/services/inventory";
import {
  TEST_PRODUCT_ID,
  createOrderFromReservation,
  createTestDatabase,
  resetData,
  seedProduct,
} from "./helpers/database";

/**
 * Garantías que sostiene el motor, no la aplicación. Cada una de estas pruebas
 * falla si alguien borra un CHECK, un índice único o un trigger de la
 * migración — que es exactamente lo que hay que impedir.
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

describe("el mismo código no entra dos veces al inventario", () => {
  it("la huella única rechaza el duplicado", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const encrypted = encryptCode("VLR-DUPE-0001");

    const insert = () =>
      pool.query(
        `INSERT INTO codes (product_id, secret_cipher, secret_nonce, secret_tag, secret_fingerprint)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          TEST_PRODUCT_ID,
          encrypted.cipher,
          encrypted.nonce,
          encrypted.tag,
          encrypted.fingerprint,
        ],
      );

    await insert();
    // Mismo texto plano → misma huella, aunque el cifrado use otro nonce.
    await expect(insert()).rejects.toThrow(/codes_secret_fingerprint_key/);
  });
});

describe("un order_item tiene exactamente los códigos que declara", () => {
  it("el trigger diferido rechaza el pedido si faltan códigos", async () => {
    await seedProduct(pool, { codeCount: 2 });

    const reservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "incompleto" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 2 }],
      }),
    );

    // Declara 2 pero solo asigna 1: debe reventar en el COMMIT.
    await expect(
      createOrderFromReservation(pool, {
        reservationId: reservation.reservationId,
        productId: TEST_PRODUCT_ID,
        quantity: 2,
        attachQuantity: 1,
      }),
    ).rejects.toThrow(/declara 2 código\(s\) pero tiene 1/);

    const { rows } = await pool.query<{ count: string }>("SELECT count(*) AS count FROM orders");
    expect(Number(rows[0].count)).toBe(0);
  });

  it("acepta el pedido cuando la cantidad coincide", async () => {
    await seedProduct(pool, { codeCount: 2 });

    const reservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "correcto" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 2 }],
      }),
    );

    const order = await createOrderFromReservation(pool, {
      reservationId: reservation.reservationId,
      productId: TEST_PRODUCT_ID,
      quantity: 2,
    });

    expect(order.codeIds).toHaveLength(2);
  });
});

describe("la aritmética del pedido la verifica la base", () => {
  it("rechaza un total que no cierra", async () => {
    await expect(
      pool.query(
        `INSERT INTO orders (order_number, access_token_hash, email, subtotal_cop, discount_cop, total_cop)
         VALUES ('BAD1-0001', '\\x00'::bytea, 'a@b.co', 10000, 1000, 9500)`,
      ),
    ).rejects.toThrow(/orders_total_matches/);
  });
});

describe("un código AVAILABLE no puede arrastrar punteros", () => {
  it("rechaza AVAILABLE con reservation_id colgado", async () => {
    const { codeIds } = await seedProduct(pool, { codeCount: 1 });
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO reservations (guest_key, expires_at)
       VALUES ('x', now() + interval '10 minutes') RETURNING id`,
    );

    await expect(
      pool.query("UPDATE codes SET reservation_id = $1 WHERE id = $2", [rows[0].id, codeIds[0]]),
    ).rejects.toThrow(/codes_available_is_clean/);
  });
});

describe("límite por pedido", () => {
  it("no deja reservar más de max_per_order", async () => {
    await seedProduct(pool, { codeCount: 50, maxPerOrder: 3 });

    await expect(
      withTransaction(pool, (tx) =>
        createReservation(tx, {
          owner: { guestKey: "acaparador" },
          lines: [{ productId: TEST_PRODUCT_ID, quantity: 4 }],
        }),
      ),
    ).rejects.toBeInstanceOf(QuantityNotAllowedError);
  });
});

describe("audit_logs", () => {
  it("es append-only incluso para el dueño de la tabla", async () => {
    await writeAudit(db, {
      actorType: "SYSTEM",
      action: "code.reserved",
      entityType: "code",
      entityId: "abc",
    });

    await expect(pool.query("UPDATE audit_logs SET action = 'otra'")).rejects.toThrow(
      /append-only/,
    );
    await expect(pool.query("DELETE FROM audit_logs")).rejects.toThrow(/append-only/);
  });

  it("se niega a guardar un código en claro", async () => {
    await expect(
      writeAudit(db, {
        actorType: "CUSTOMER",
        action: "code.revealed",
        entityType: "code",
        entityId: "abc",
        metadata: { code: "VLR-1234-5678" },
      }),
    ).rejects.toThrow(/podría contener un secreto en claro/);

    // Anidado también.
    await expect(
      writeAudit(db, {
        actorType: "CUSTOMER",
        action: "code.revealed",
        entityType: "code",
        entityId: "abc",
        metadata: { detalle: { secret: "VLR-1234-5678" } },
      }),
    ).rejects.toThrow(/podría contener un secreto en claro/);
  });

  it("acepta metadatos sin secretos", async () => {
    await writeAudit(db, {
      actorType: "CUSTOMER",
      action: "code.revealed",
      entityType: "code",
      entityId: "abc",
      metadata: { orderId: "A7F3-2291", intento: 1 },
      ip: "203.0.113.7",
    });

    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM audit_logs WHERE action = 'code.revealed'",
    );
    expect(Number(rows[0].count)).toBe(1);
  });
});

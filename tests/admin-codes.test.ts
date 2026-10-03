import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ValidatedSession } from "@/server/auth/session";
import { encryptCode } from "@/server/crypto/codes";
import { bulkAddCodes, revealCode, voidCode } from "@/server/services/admin-codes";
import { CodeNotEditableError, CodeNotFoundError, CodeNotOwnedError } from "@/server/services/errors";
import {
  TEST_PRODUCT_ID,
  createTestDatabase,
  resetData,
  seedCodesWithBatch,
  seedProduct,
  seedTestUser,
} from "./helpers/database";

let pool: Pool;

beforeAll(async () => {
  pool = await createTestDatabase();
}, 120_000);

afterAll(async () => {
  await pool?.end();
});

beforeEach(async () => {
  await resetData(pool);
});

function sessionOf(userId: string): ValidatedSession {
  return {
    sessionId: "s1",
    userId,
    email: "admin@test.local",
    name: null,
    role: "ADMIN",
    purchasesCount: 0,
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

describe("voidCode", () => {
  it("pasa un código AVAILABLE a VOID y audita code.voided", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const adminId = await seedTestUser(pool, "admin1@test.local");
    const [codeId] = await seedCodesWithBatch(pool, {
      productId: TEST_PRODUCT_ID,
      uploadedBy: adminId,
      count: 1,
    });

    await voidCode(pool, sessionOf(adminId), codeId);

    const { rows } = await pool.query<{ status: string }>(
      "SELECT status FROM codes WHERE id = $1::uuid",
      [codeId],
    );
    expect(rows[0].status).toBe("VOID");

    const audit = await pool.query(
      "SELECT 1 FROM audit_logs WHERE entity_id = $1 AND action = 'code.voided'",
      [codeId],
    );
    expect(audit.rows).toHaveLength(1);
  });

  it("rechaza anular un código cargado por otro admin", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const admin1 = await seedTestUser(pool, "admin1@test.local");
    const admin2 = await seedTestUser(pool, "admin2@test.local");
    const [codeId] = await seedCodesWithBatch(pool, {
      productId: TEST_PRODUCT_ID,
      uploadedBy: admin1,
      count: 1,
    });

    await expect(voidCode(pool, sessionOf(admin2), codeId)).rejects.toBeInstanceOf(CodeNotOwnedError);
  });

  it("rechaza anular un código que ya no está AVAILABLE", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const adminId = await seedTestUser(pool, "admin1@test.local");
    const [codeId] = await seedCodesWithBatch(pool, {
      productId: TEST_PRODUCT_ID,
      uploadedBy: adminId,
      count: 1,
    });
    await pool.query("UPDATE codes SET status = 'VOID' WHERE id = $1::uuid", [codeId]);

    await expect(voidCode(pool, sessionOf(adminId), codeId)).rejects.toBeInstanceOf(CodeNotEditableError);
  });

  it("código inexistente da CodeNotFoundError", async () => {
    const adminId = await seedTestUser(pool, "admin1@test.local");

    await expect(
      voidCode(pool, sessionOf(adminId), "00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(CodeNotFoundError);
  });
});

describe("revealCode", () => {
  it("funciona sobre un código VOID, no solo AVAILABLE", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const adminId = await seedTestUser(pool, "admin1@test.local");
    const [codeId] = await seedCodesWithBatch(pool, {
      productId: TEST_PRODUCT_ID,
      uploadedBy: adminId,
      count: 1,
    });
    await voidCode(pool, sessionOf(adminId), codeId);

    const plain = await revealCode(pool, sessionOf(adminId), codeId);
    expect(plain).toMatch(/^TST-/);
  });

  it("un código RESERVED (ni AVAILABLE ni VOID) sigue sin poder revelarse", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const adminId = await seedTestUser(pool, "admin1@test.local");
    const [codeId] = await seedCodesWithBatch(pool, {
      productId: TEST_PRODUCT_ID,
      uploadedBy: adminId,
      count: 1,
    });
    await pool.query(
      "UPDATE codes SET status = 'RESERVED', reserved_until = now() + interval '10 minutes' WHERE id = $1::uuid",
      [codeId],
    );

    await expect(revealCode(pool, sessionOf(adminId), codeId)).rejects.toBeInstanceOf(CodeNotEditableError);
  });
});

describe("bulkAddCodes — reactivar un código propio ya anulado", () => {
  it("re-pegar el mismo código de un VOID propio lo reactiva, no lo cuenta como duplicado", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const adminId = await seedTestUser(pool, "admin1@test.local");
    const plain = "VLR-REAC-T1V0";
    const encrypted = encryptCode(plain);
    const batch = await pool.query<{ id: string }>(
      `INSERT INTO code_batches (product_id, uploaded_by, source) VALUES ($1, $2, 'test') RETURNING id`,
      [TEST_PRODUCT_ID, adminId],
    );
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO codes (product_id, secret_cipher, secret_nonce, secret_tag, secret_fingerprint, batch_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,'VOID') RETURNING id`,
      [TEST_PRODUCT_ID, encrypted.cipher, encrypted.nonce, encrypted.tag, encrypted.fingerprint, batch.rows[0].id],
    );
    const codeId = inserted.rows[0].id;

    const result = await bulkAddCodes(pool, sessionOf(adminId), TEST_PRODUCT_ID, [plain], undefined);

    expect(result).toEqual({ inserted: 0, reactivated: 1, duplicates: 0 });
    const { rows } = await pool.query<{ status: string; id: string }>(
      "SELECT id, status FROM codes WHERE secret_fingerprint = $1",
      [encrypted.fingerprint],
    );
    expect(rows).toHaveLength(1); // no se creó una fila nueva — se reactivó la misma
    expect(rows[0].id).toBe(codeId);
    expect(rows[0].status).toBe("AVAILABLE");

    const audit = await pool.query(
      "SELECT 1 FROM audit_logs WHERE action = 'code.unvoided' AND entity_id = $1",
      [TEST_PRODUCT_ID],
    );
    expect(audit.rows).toHaveLength(1);
  });

  it("un VOID de OTRO admin sigue contando como duplicado, no se reactiva", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const admin1 = await seedTestUser(pool, "admin1@test.local");
    const admin2 = await seedTestUser(pool, "admin2@test.local");
    const plain = "VLR-AJEN-O0000";
    const encrypted = encryptCode(plain);
    const batch = await pool.query<{ id: string }>(
      `INSERT INTO code_batches (product_id, uploaded_by, source) VALUES ($1, $2, 'test') RETURNING id`,
      [TEST_PRODUCT_ID, admin1],
    );
    await pool.query(
      `INSERT INTO codes (product_id, secret_cipher, secret_nonce, secret_tag, secret_fingerprint, batch_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,'VOID')`,
      [TEST_PRODUCT_ID, encrypted.cipher, encrypted.nonce, encrypted.tag, encrypted.fingerprint, batch.rows[0].id],
    );

    const result = await bulkAddCodes(pool, sessionOf(admin2), TEST_PRODUCT_ID, [plain], undefined);

    expect(result).toEqual({ inserted: 0, reactivated: 0, duplicates: 1 });
  });

  it("un duplicado de un código todavía AVAILABLE sigue siendo duplicado (sin cambios)", async () => {
    await seedProduct(pool, { codeCount: 0 });
    const adminId = await seedTestUser(pool, "admin1@test.local");
    const plain = "VLR-SIGO-DISP0";
    await bulkAddCodes(pool, sessionOf(adminId), TEST_PRODUCT_ID, [plain], undefined);

    const result = await bulkAddCodes(pool, sessionOf(adminId), TEST_PRODUCT_ID, [plain], undefined);

    expect(result).toEqual({ inserted: 0, reactivated: 0, duplicates: 1 });
  });
});

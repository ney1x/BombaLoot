import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createDb, type Db } from "@/server/db/client";
import type { ValidatedSession } from "@/server/auth/session";
import {
  getCodeLifecycleSettings,
  updateCodeLifecycleSettings,
  updateCodeLifecycleSettingsSchema,
} from "@/server/services/code-lifecycle-settings";
import { createTestDatabase, resetData, seedTestUser } from "./helpers/database";

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

function sessionOf(userId: string): ValidatedSession {
  return {
    sessionId: "s1",
    userId,
    email: "super@test.local",
    name: null,
    role: "SUPERADMIN",
    purchasesCount: 0,
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

describe("code_lifecycle_settings", () => {
  it("trae los valores default sembrados por la migración 0023", async () => {
    const settings = await getCodeLifecycleSettings(db);
    expect(settings).toMatchObject({ expiryDays: 90, riskWindowDays: 70, fairnessGapDays: 45 });
  });

  it("actualiza los valores y audita code_lifecycle_settings.updated", async () => {
    const userId = await seedTestUser(pool, "super@test.local");

    const updated = await updateCodeLifecycleSettings(pool, sessionOf(userId), {
      expiryDays: 120,
      riskWindowDays: 90,
      fairnessGapDays: 30,
    });

    expect(updated).toMatchObject({
      expiryDays: 120,
      riskWindowDays: 90,
      fairnessGapDays: 30,
      updatedByName: "super@test.local",
    });

    const again = await getCodeLifecycleSettings(db);
    expect(again).toMatchObject({ expiryDays: 120, riskWindowDays: 90, fairnessGapDays: 30 });

    const audit = await pool.query(
      "SELECT 1 FROM audit_logs WHERE action = 'code_lifecycle_settings.updated'",
    );
    expect(audit.rows).toHaveLength(1);
  });

  it("el schema rechaza expiryDays <= riskWindowDays", () => {
    expect(() =>
      updateCodeLifecycleSettingsSchema.parse({ expiryDays: 60, riskWindowDays: 60, fairnessGapDays: 10 }),
    ).toThrow(ZodError);
  });

  it("el schema rechaza números no positivos", () => {
    expect(() =>
      updateCodeLifecycleSettingsSchema.parse({ expiryDays: 90, riskWindowDays: 0, fairnessGapDays: 10 }),
    ).toThrow(ZodError);
  });
});

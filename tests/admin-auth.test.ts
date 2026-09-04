import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/server/db/client";
import {
  ForbiddenError,
  InvalidRoleTransitionError,
  LastAdminError,
  SelfRoleChangeError,
  TargetUserNotFoundError,
  UnauthorizedError,
} from "@/server/auth/errors";
import { assertAdminOrSupportRole, assertAdminRole, assertSuperAdminRole } from "@/server/auth/admin-guards";
import { createSession, type ValidatedSession } from "@/server/auth/session";
import { registerUser } from "@/server/services/auth-service";
import {
  assignSupportRole,
  removeAdminRole,
  removeSupportRole,
  restoreAdminRole,
} from "@/server/services/admin-service";
import { createTestDatabase, resetData } from "./helpers/database";

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

let userCounter = 0;

/** Registra un usuario, lo sube (o no) al rol pedido, y arma una sesión válida como haría un login real. */
async function makeSessionWithRole(role: "CUSTOMER" | "ADMIN" | "SUPPORT" | "SUPERADMIN"): Promise<ValidatedSession> {
  userCounter += 1;
  const email = `usuario${userCounter}@test.local`;
  const { user } = await registerUser(pool, { name: `Usuario ${userCounter}`, email, password: "correcto-caballo-batería" }, {});

  if (role !== "CUSTOMER") {
    await pool.query(`UPDATE users SET role = $1 WHERE id = $2::uuid`, [role, user.id]);
  }

  const session = await createSession(db, user.id);
  return {
    sessionId: session.sessionId,
    userId: user.id,
    email,
    name: user.name,
    role,
    purchasesCount: 0,
    expiresAt: session.expiresAt,
  };
}

/* ═══════════════════════════ Guards puros (rol) ═══════════════════════════ */

describe("modelo de roles ADMIN/SUPPORT/SUPERADMIN", () => {
  it("SUPERADMIN queda disponible en el enum de la base (migración 0022)", async () => {
    const { rows } = await pool.query<{ unnest: string }>(
      "SELECT unnest(enum_range(NULL::user_role))::text",
    );
    expect(rows.map((r) => r.unnest)).toEqual(["CUSTOMER", "ADMIN", "SUPPORT", "SUPERADMIN"]);
  });
});

/* ═══════════════════════════ assignSupportRole / removeSupportRole ═══════════════════════════ */

describe("assignSupportRole", () => {
  it("ADMIN puede asignar SUPPORT a un CUSTOMER", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    const customer = await makeSessionWithRole("CUSTOMER");

    await assignSupportRole(pool, admin, customer.userId);

    const { rows } = await pool.query<{ role: string }>("SELECT role FROM users WHERE id = $1::uuid", [
      customer.userId,
    ]);
    expect(rows[0].role).toBe("SUPPORT");
  });

  it("audita support.role_assigned con actor ADMIN, sin admin_actions separada", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    const customer = await makeSessionWithRole("CUSTOMER");

    await assignSupportRole(pool, admin, customer.userId);

    const { rows } = await pool.query<{
      actor_type: string;
      actor_id: string;
      action: string;
      entity_id: string;
      metadata: { fromRole: string; toRole: string };
    }>(
      `SELECT actor_type, actor_id, action, entity_id, metadata FROM audit_logs
        WHERE action = 'support.role_assigned' ORDER BY id DESC LIMIT 1`,
    );
    expect(rows[0].actor_type).toBe("ADMIN");
    expect(rows[0].actor_id).toBe(admin.userId);
    expect(rows[0].entity_id).toBe(customer.userId);
    expect(rows[0].metadata).toEqual({ fromRole: "CUSTOMER", toRole: "SUPPORT" });
  });

  it("rechaza asignar SUPPORT a alguien que ya es SUPPORT", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    const support = await makeSessionWithRole("SUPPORT");

    await expect(assignSupportRole(pool, admin, support.userId)).rejects.toBeInstanceOf(
      InvalidRoleTransitionError,
    );
  });

  it("rechaza asignar SUPPORT a un ADMIN", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    const otherAdmin = await makeSessionWithRole("ADMIN");

    await expect(assignSupportRole(pool, admin, otherAdmin.userId)).rejects.toBeInstanceOf(
      InvalidRoleTransitionError,
    );
  });

  it("un ADMIN no puede asignarse SUPPORT a sí mismo", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    await expect(assignSupportRole(pool, admin, admin.userId)).rejects.toBeInstanceOf(SelfRoleChangeError);
  });

  it("usuario objetivo inexistente da TargetUserNotFoundError", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    await expect(
      assignSupportRole(pool, admin, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(TargetUserNotFoundError);
  });
});

describe("removeSupportRole", () => {
  it("ADMIN puede retirar SUPPORT (vuelve a CUSTOMER)", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    const support = await makeSessionWithRole("SUPPORT");

    await removeSupportRole(pool, admin, support.userId);

    const { rows } = await pool.query<{ role: string }>("SELECT role FROM users WHERE id = $1::uuid", [
      support.userId,
    ]);
    expect(rows[0].role).toBe("CUSTOMER");
  });

  it("audita support.role_removed", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    const support = await makeSessionWithRole("SUPPORT");

    await removeSupportRole(pool, admin, support.userId);

    const { rows } = await pool.query<{ action: string }>(
      `SELECT action FROM audit_logs WHERE action = 'support.role_removed' AND entity_id = $1 ORDER BY id DESC LIMIT 1`,
      [support.userId],
    );
    expect(rows).toHaveLength(1);
  });

  it("rechaza retirar SUPPORT de un CUSTOMER (no lo tiene)", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    const customer = await makeSessionWithRole("CUSTOMER");

    await expect(removeSupportRole(pool, admin, customer.userId)).rejects.toBeInstanceOf(
      InvalidRoleTransitionError,
    );
  });

  it("un ADMIN no puede retirarse su propio rol por este camino", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    await expect(removeSupportRole(pool, admin, admin.userId)).rejects.toBeInstanceOf(SelfRoleChangeError);
  });
});

/* ═══════════════════════════ Guards de API admin (assertAdminRole / assertAdminOrSupportRole) ═══════════════════════════ */

function sessionOf(role: "CUSTOMER" | "ADMIN" | "SUPPORT" | "SUPERADMIN"): ValidatedSession {
  return {
    sessionId: "s1",
    userId: "u1",
    email: "x@test.local",
    name: null,
    role,
    purchasesCount: 0,
    expiresAt: new Date(Date.now() + 1000),
  };
}

describe("assertAdminRole — ADMIN y SUPERADMIN pasan", () => {
  it("sin sesión → UnauthorizedError", () => {
    expect(() => assertAdminRole(null)).toThrow(UnauthorizedError);
  });

  it("CUSTOMER → ForbiddenError", () => {
    expect(() => assertAdminRole(sessionOf("CUSTOMER"))).toThrow(ForbiddenError);
  });

  it("SUPPORT → ForbiddenError (SUPPORT no ejecuta acciones ADMIN)", () => {
    expect(() => assertAdminRole(sessionOf("SUPPORT"))).toThrow(ForbiddenError);
  });

  it("ADMIN → pasa", () => {
    expect(() => assertAdminRole(sessionOf("ADMIN"))).not.toThrow();
  });

  it("SUPERADMIN → pasa (superset de ADMIN)", () => {
    expect(() => assertAdminRole(sessionOf("SUPERADMIN"))).not.toThrow();
  });
});

describe("assertAdminOrSupportRole — ADMIN, SUPPORT o SUPERADMIN pasan", () => {
  it("sin sesión → UnauthorizedError", () => {
    expect(() => assertAdminOrSupportRole(null)).toThrow(UnauthorizedError);
  });

  it("CUSTOMER → ForbiddenError", () => {
    expect(() => assertAdminOrSupportRole(sessionOf("CUSTOMER"))).toThrow(ForbiddenError);
  });

  it("SUPPORT → pasa (endpoint permitido para SUPPORT)", () => {
    expect(() => assertAdminOrSupportRole(sessionOf("SUPPORT"))).not.toThrow();
  });

  it("ADMIN → pasa (ADMIN también actúa como SUPPORT operativamente)", () => {
    expect(() => assertAdminOrSupportRole(sessionOf("ADMIN"))).not.toThrow();
  });

  it("SUPERADMIN → pasa", () => {
    expect(() => assertAdminOrSupportRole(sessionOf("SUPERADMIN"))).not.toThrow();
  });
});

describe("assertSuperAdminRole — solo SUPERADMIN pasa", () => {
  it("sin sesión → UnauthorizedError", () => {
    expect(() => assertSuperAdminRole(null)).toThrow(UnauthorizedError);
  });

  it("CUSTOMER → ForbiddenError", () => {
    expect(() => assertSuperAdminRole(sessionOf("CUSTOMER"))).toThrow(ForbiddenError);
  });

  it("ADMIN → ForbiddenError (un ADMIN normal ya no puede tocar el rol ADMIN de nadie)", () => {
    expect(() => assertSuperAdminRole(sessionOf("ADMIN"))).toThrow(ForbiddenError);
  });

  it("SUPPORT → ForbiddenError", () => {
    expect(() => assertSuperAdminRole(sessionOf("SUPPORT"))).toThrow(ForbiddenError);
  });

  it("SUPERADMIN → pasa", () => {
    expect(() => assertSuperAdminRole(sessionOf("SUPERADMIN"))).not.toThrow();
  });
});

/* ═══════════════════════════ removeAdminRole / restoreAdminRole (SUPERADMIN) ═══════════════════════════ */

describe("removeAdminRole", () => {
  it("permite sacar el último ADMIN normal si sigue habiendo un SUPERADMIN", async () => {
    const superadmin = await makeSessionWithRole("SUPERADMIN");
    const admin = await makeSessionWithRole("ADMIN");

    await removeAdminRole(pool, superadmin, admin.userId);

    const { rows } = await pool.query<{ role: string }>("SELECT role FROM users WHERE id = $1::uuid", [
      admin.userId,
    ]);
    expect(rows[0].role).toBe("CUSTOMER");
  });

  it("bloquea dejar el sitio sin ningún ADMIN ni SUPERADMIN", async () => {
    // Único rol admin-tier en toda la tabla (resetData la vació en beforeEach).
    const admin = await makeSessionWithRole("ADMIN");
    // El guard real de ruta (`requireSuperAdminApi`) ya exige SUPERADMIN antes
    // de llegar acá — este test prueba el conteo del propio servicio, no
    // repite ese guard, así que el actor puede ser cualquiera.
    const actor = await makeSessionWithRole("CUSTOMER");

    await expect(removeAdminRole(pool, actor, admin.userId)).rejects.toBeInstanceOf(LastAdminError);

    const { rows } = await pool.query<{ role: string }>("SELECT role FROM users WHERE id = $1::uuid", [
      admin.userId,
    ]);
    expect(rows[0].role).toBe("ADMIN");
  });

  it("audita admin.role_removed", async () => {
    const superadmin = await makeSessionWithRole("SUPERADMIN");
    const admin = await makeSessionWithRole("ADMIN");

    await removeAdminRole(pool, superadmin, admin.userId);

    const { rows } = await pool.query<{ action: string }>(
      `SELECT action FROM audit_logs WHERE action = 'admin.role_removed' AND entity_id = $1 ORDER BY id DESC LIMIT 1`,
      [admin.userId],
    );
    expect(rows).toHaveLength(1);
  });
});

describe("restoreAdminRole", () => {
  it("rechaza restaurar a alguien que nunca fue ADMIN", async () => {
    const superadmin = await makeSessionWithRole("SUPERADMIN");
    const customer = await makeSessionWithRole("CUSTOMER");

    await expect(restoreAdminRole(pool, superadmin, customer.userId)).rejects.toBeInstanceOf(
      InvalidRoleTransitionError,
    );
  });

  it("rechaza restaurar sobre una cuenta que ya es SUPERADMIN (no la degrada a ADMIN)", async () => {
    const superadmin = await makeSessionWithRole("SUPERADMIN");
    const otherSuperadmin = await makeSessionWithRole("SUPERADMIN");

    await expect(restoreAdminRole(pool, superadmin, otherSuperadmin.userId)).rejects.toBeInstanceOf(
      InvalidRoleTransitionError,
    );

    const { rows } = await pool.query<{ role: string }>("SELECT role FROM users WHERE id = $1::uuid", [
      otherSuperadmin.userId,
    ]);
    expect(rows[0].role).toBe("SUPERADMIN");
  });

  it("restaura a ADMIN a quien tiene un admin.role_removed real en el log", async () => {
    const superadmin = await makeSessionWithRole("SUPERADMIN");
    const admin = await makeSessionWithRole("ADMIN");
    // Necesita un segundo ADMIN/SUPERADMIN vivo para que removeAdminRole no
    // choque con LastAdminError.
    await removeAdminRole(pool, superadmin, admin.userId);

    await restoreAdminRole(pool, superadmin, admin.userId);

    const { rows } = await pool.query<{ role: string }>("SELECT role FROM users WHERE id = $1::uuid", [
      admin.userId,
    ]);
    expect(rows[0].role).toBe("ADMIN");
  });
});

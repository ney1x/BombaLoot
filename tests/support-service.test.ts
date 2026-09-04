import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/server/db/client";
import { createOpaqueToken, generateOrderNumber } from "@/server/auth/tokens";
import { createSession, type ValidatedSession } from "@/server/auth/session";
import { registerUser } from "@/server/services/auth-service";
import { createSupportTicket, loadOwnedTicket, updateTicketAdmin } from "@/server/services/support-service";
import {
  InvalidAssigneeError,
  OrderTooOldForSupportError,
  SupportOrderNotFoundError,
  SupportTicketNotFoundError,
} from "@/server/services/errors";
import { createTestDatabase, resetData } from "./helpers/database";

/**
 * `SUPPORT_LIMITS.orderMaxAgeDays` (default 21, ver `support-limits.ts`) —
 * un pedido real pero más viejo que eso ya no admite ticket nuevo.
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

async function seedOrder(ageDays: number): Promise<string> {
  const token = createOpaqueToken();
  const orderNumber = generateOrderNumber();
  await pool.query(
    `INSERT INTO orders (order_number, access_token_hash, email, subtotal_cop, discount_cop, total_cop, created_at)
     VALUES ($1, $2, 'comprador@test.local', 10000, 0, 10000, now() - make_interval(days => $3))`,
    [orderNumber, token.hash, ageDays],
  );
  return orderNumber;
}

const baseInput = (orderNumberInput?: string) => ({
  email: "comprador@test.local",
  category: "ORDER_ISSUE" as const,
  message: "El código que recibí no funciona, ya lo intenté varias veces.",
  orderNumberInput,
});

describe("createSupportTicket — ventana de soporte por edad del pedido", () => {
  it("un pedido de 10 días (dentro de la ventana) crea el ticket normal", async () => {
    const orderNumber = await seedOrder(10);

    const { ticket } = await createSupportTicket(pool, baseInput(orderNumber), { ip: "1.2.3.4" });

    expect(ticket.orderNumber).toBe(orderNumber);
  });

  it("un pedido de 22 días (fuera de la ventana de 21) rechaza con OrderTooOldForSupportError", async () => {
    const orderNumber = await seedOrder(22);

    await expect(
      createSupportTicket(pool, baseInput(orderNumber), { ip: "1.2.3.5" }),
    ).rejects.toBeInstanceOf(OrderTooOldForSupportError);
  });

  it("aplica aunque el motivo no exija número de pedido (LOST_ORDER_NUMBER)", async () => {
    const orderNumber = await seedOrder(30);

    await expect(
      createSupportTicket(
        pool,
        { ...baseInput(orderNumber), category: "LOST_ORDER_NUMBER" },
        { ip: "1.2.3.6" },
      ),
    ).rejects.toBeInstanceOf(OrderTooOldForSupportError);
  });

  it("un número que no matchea ningún pedido sigue dando SupportOrderNotFoundError, no la de vigencia", async () => {
    await expect(
      createSupportTicket(pool, baseInput("NO-EXISTE-1234"), { ip: "1.2.3.7" }),
    ).rejects.toBeInstanceOf(SupportOrderNotFoundError);
  });
});

/* ═══════════════════════════ updateTicketAdmin — auditoría de seguridad ═══════════════════════════ */

let userCounter = 0;

/** Registra un usuario, lo sube (o no) al rol pedido, y arma una sesión válida como haría un login real. */
async function makeSessionWithRole(role: "CUSTOMER" | "ADMIN" | "SUPPORT" | "SUPERADMIN"): Promise<ValidatedSession> {
  userCounter += 1;
  const email = `staff${userCounter}@test.local`;
  const { user } = await registerUser(
    pool,
    { name: `Staff ${userCounter}`, email, password: "correcto-caballo-batería" },
    {},
  );
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

let ticketIpCounter = 0;

/** IP distinta por llamada — `SUPPORT_LIMITS` limita creación de tickets por IP, y este describe crea varios. */
async function seedTicketId(): Promise<string> {
  ticketIpCounter += 1;
  const orderNumber = await seedOrder(10);
  const { ticket } = await createSupportTicket(pool, baseInput(orderNumber), { ip: `9.9.${ticketIpCounter}.9` });
  return ticket.id;
}

describe("updateTicketAdmin — asignación y auditoría (auditoría de seguridad, 2026-09-04)", () => {
  it("asignar a un ADMIN/SUPPORT real funciona", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    const assignee = await makeSessionWithRole("SUPPORT");
    const ticketId = await seedTicketId();

    const result = await updateTicketAdmin(db, ticketId, { assignedTo: assignee.userId }, admin);
    expect(result.id).toBe(ticketId);

    const { rows } = await pool.query<{ assigned_to: string }>(
      "SELECT assigned_to FROM support_tickets WHERE id = $1",
      [ticketId],
    );
    expect(rows[0].assigned_to).toBe(assignee.userId);
  });

  it("rechaza asignar a un id que no es staff (regresión: antes aceptaba cualquier UUID)", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    const customer = await makeSessionWithRole("CUSTOMER");
    const ticketId = await seedTicketId();

    await expect(
      updateTicketAdmin(db, ticketId, { assignedTo: customer.userId }, admin),
    ).rejects.toBeInstanceOf(InvalidAssigneeError);

    const { rows } = await pool.query<{ assigned_to: string | null }>(
      "SELECT assigned_to FROM support_tickets WHERE id = $1",
      [ticketId],
    );
    expect(rows[0].assigned_to).toBeNull(); // no quedó a medio asignar
  });

  it("rechaza asignar a un UUID inventado que no existe", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    const ticketId = await seedTicketId();

    await expect(
      updateTicketAdmin(db, ticketId, { assignedTo: crypto.randomUUID() }, admin),
    ).rejects.toBeInstanceOf(InvalidAssigneeError);
  });

  it("desasignar (assignedTo: null) sigue funcionando sin pasar por la validación de rol", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    const assignee = await makeSessionWithRole("SUPPORT");
    const ticketId = await seedTicketId();
    await updateTicketAdmin(db, ticketId, { assignedTo: assignee.userId }, admin);

    await updateTicketAdmin(db, ticketId, { assignedTo: null }, admin);

    const { rows } = await pool.query<{ assigned_to: string | null }>(
      "SELECT assigned_to FROM support_tickets WHERE id = $1",
      [ticketId],
    );
    expect(rows[0].assigned_to).toBeNull();
  });

  it("regresión: cambiar status y/o reasignar queda auditado (antes no dejaba rastro)", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    const assignee = await makeSessionWithRole("SUPPORT");
    const ticketId = await seedTicketId();

    await updateTicketAdmin(
      db,
      ticketId,
      { status: "IN_PROGRESS", assignedTo: assignee.userId },
      admin,
      { ip: "5.5.5.5", userAgent: "vitest" },
    );

    const { rows } = await pool.query<{ metadata: { status?: string; assignedTo?: string }; actor_id: string; ip: string | null }>(
      "SELECT metadata, actor_id, ip FROM audit_logs WHERE action = 'support.ticket_updated' AND entity_id = $1",
      [ticketId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_id).toBe(admin.userId);
    expect(rows[0].metadata.status).toBe("IN_PROGRESS");
    expect(rows[0].metadata.assignedTo).toBe(assignee.userId);
    expect(rows[0].ip).toBe("5.5.5.5");
  });

  it("un PATCH vacío (sin status ni assignedTo) no genera una fila de auditoría de la nada", async () => {
    const admin = await makeSessionWithRole("ADMIN");
    const ticketId = await seedTicketId();

    await updateTicketAdmin(db, ticketId, {}, admin);

    const { rows } = await pool.query(
      "SELECT 1 FROM audit_logs WHERE action = 'support.ticket_updated' AND entity_id = $1",
      [ticketId],
    );
    expect(rows).toHaveLength(0);
  });
});

/* ═══════════════════════════ loadOwnedTicket — auditoría de seguridad ═══════════════════════════ */

describe("loadOwnedTicket — mismo rol que loadOwnedOrder, para tickets (auditoría de seguridad, 2026-09-04)", () => {
  it("resuelve por sesión (userId) cuando el ticket es del usuario", async () => {
    const orderNumber = await seedOrder(5);
    const { user } = await registerUser(
      pool,
      { name: "Dueño del ticket", email: `owner${Date.now()}@test.local`, password: "correcto-caballo-batería" },
      {},
    );
    const { ticket } = await createSupportTicket(pool, baseInput(orderNumber), { ip: "8.1.1.1", userId: user.id });

    const resolved = await loadOwnedTicket(pool, { ticketId: ticket.id, userId: user.id });
    expect(resolved.id).toBe(ticket.id);
  });

  it("resuelve por accessToken cuando coincide con el ticketId pedido", async () => {
    const orderNumber = await seedOrder(5);
    const { ticket, accessToken } = await createSupportTicket(pool, baseInput(orderNumber), { ip: "8.1.1.2" });

    const resolved = await loadOwnedTicket(pool, { ticketId: ticket.id, accessToken });
    expect(resolved.id).toBe(ticket.id);
  });

  it("rechaza si el accessToken es válido pero para OTRO ticket (cruce de id, no solo posesión del token)", async () => {
    const orderNumberA = await seedOrder(5);
    const orderNumberB = await seedOrder(6);
    const ticketA = await createSupportTicket(pool, baseInput(orderNumberA), { ip: "8.1.1.3" });
    const ticketB = await createSupportTicket(pool, baseInput(orderNumberB), { ip: "8.1.1.4" });

    // El token de B es válido — pero se pide el ticketId de A.
    await expect(
      loadOwnedTicket(pool, { ticketId: ticketA.ticket.id, accessToken: ticketB.accessToken }),
    ).rejects.toBeInstanceOf(SupportTicketNotFoundError);
  });

  it("rechaza sin userId ni accessToken", async () => {
    const orderNumber = await seedOrder(5);
    const { ticket } = await createSupportTicket(pool, baseInput(orderNumber), { ip: "8.1.1.5" });

    await expect(loadOwnedTicket(pool, { ticketId: ticket.id })).rejects.toBeInstanceOf(SupportTicketNotFoundError);
  });

  it("rechaza un accessToken ajeno con un userId que tampoco es dueño (ninguno de los dos matchea)", async () => {
    const orderNumber = await seedOrder(5);
    const { user: otherUser } = await registerUser(
      pool,
      { name: "Otro usuario", email: `other${Date.now()}@test.local`, password: "correcto-caballo-batería" },
      {},
    );
    const { ticket } = await createSupportTicket(pool, baseInput(orderNumber), { ip: "8.1.1.6" });

    await expect(
      loadOwnedTicket(pool, { ticketId: ticket.id, userId: otherUser.id }),
    ).rejects.toBeInstanceOf(SupportTicketNotFoundError);
  });
});

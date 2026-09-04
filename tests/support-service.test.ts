import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOpaqueToken, generateOrderNumber } from "@/server/auth/tokens";
import { createSupportTicket } from "@/server/services/support-service";
import { OrderTooOldForSupportError, SupportOrderNotFoundError } from "@/server/services/errors";
import { createTestDatabase, resetData } from "./helpers/database";

/**
 * `SUPPORT_LIMITS.orderMaxAgeDays` (default 21, ver `support-limits.ts`) —
 * un pedido real pero más viejo que eso ya no admite ticket nuevo.
 */

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

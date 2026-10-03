// Fixture POSITIVA para el hallazgo C1: el uso correcto (dentro de una
// transacción real) debe compilar sin errores, sin `@ts-expect-error` ni
// casts. Si esto deja de compilar, algo rompió la firma pública del inventario.
import { withTransaction } from "@/server/db/client";
import {
  attachCodesToOrderItem,
  claimCodesForProduct,
  confirmOrderPayment,
  createReservation,
} from "@/server/services/inventory";
import type { Pool } from "pg";

export async function shouldCompile(pool: Pool) {
  await withTransaction(pool, async (tx) => {
    await createReservation(tx, {
      owner: { guestKey: "x" },
      lines: [{ productId: "p", quantity: 1 }],
    });
    await claimCodesForProduct(tx, { productId: "p", quantity: 1, reservationId: "r" });
    await attachCodesToOrderItem(tx, {
      reservationId: "r",
      productId: "p",
      orderItemId: "oi",
      quantity: 1,
    });
    await confirmOrderPayment(tx, "order-id");
  });
}

import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { withTransaction } from "../../db/client";
import { decryptCode } from "../../crypto/codes";
import { writeAudit } from "../audit";
import { loadOwnedOrder } from "./order-access";
import { OrderNotFoundError } from "./errors";

/**
 * El paso final del flujo: `payment_status='PAID'` + `delivery_status='PENDING'`
 * → el cliente pide ver sus códigos → se descifran, se marcan `DELIVERED`
 * (código y pedido) y quedan auditados. Antes de este momento el código
 * nunca sale de la base en claro — ni siquiera cuando el pago ya se
 * confirmó, hasta que el dueño del pedido efectivamente lo pide.
 */

export interface DeliveredCode {
  productId: string;
  gameLabel: string;
  denomination: string;
  unit: string;
  code: string;
}

export interface DeliverOrderCodesResult {
  orderNumber: string;
  deliveredAt: Date;
  codes: DeliveredCode[];
}

interface CodeRow {
  id: string;
  status: string;
  product_id: string;
  game_label: string;
  denomination: string;
  unit: string;
  secret_cipher: Buffer;
  secret_nonce: Buffer;
  secret_tag: Buffer;
}

export async function deliverOrderCodes(
  pool: Pool,
  params: { orderId: string; accessToken?: string; userId?: string },
): Promise<DeliverOrderCodesResult> {
  const order = await loadOwnedOrder(pool, params);

  if (order.paymentStatus !== "PAID" || order.deliveryStatus === "UNAVAILABLE") {
    throw new OrderNotFoundError();
  }

  return withTransaction(pool, async (tx) => {
    const { rows: codeRows } = (await tx.execute(sql`
      SELECT c.id, c.status, oi.product_id, oi.game_label, oi.denomination, oi.unit,
             c.secret_cipher, c.secret_nonce, c.secret_tag
        FROM codes c
        JOIN order_items oi ON oi.id = c.order_item_id
       WHERE oi.order_id = ${order.orderId}::uuid AND c.status IN ('PAID', 'DELIVERED')
       ORDER BY oi.game_label, oi.denomination
       FOR UPDATE
    `)) as unknown as { rows: CodeRow[] };

    if (codeRows.length === 0) throw new OrderNotFoundError();

    const codes: DeliveredCode[] = codeRows.map((row) => ({
      productId: row.product_id,
      gameLabel: row.game_label,
      denomination: row.denomination,
      unit: row.unit,
      code: decryptCode({ cipher: row.secret_cipher, nonce: row.secret_nonce, tag: row.secret_tag }),
    }));

    const allIds = codeRows.map((r) => r.id);
    const newlyDeliveredIds = codeRows.filter((r) => r.status === "PAID").map((r) => r.id);

    if (newlyDeliveredIds.length > 0) {
      await tx.execute(sql`
        UPDATE codes SET status = 'DELIVERED', delivered_at = now()
         WHERE id IN (${sql.join(newlyDeliveredIds.map((id) => sql`${id}::uuid`), sql`, `)})
      `);
    }

    const { rows: orderRows } = (await tx.execute(sql`
      UPDATE orders
         SET delivery_status = 'DELIVERED', delivered_at = COALESCE(delivered_at, now()), updated_at = now()
       WHERE id = ${order.orderId}::uuid
      RETURNING order_number, delivered_at
    `)) as unknown as { rows: Array<{ order_number: string; delivered_at: string }> };

    // M5: se audita el resultado, no el intento — solo los ids de código,
    // nunca el valor en claro (`writeAudit` lo rechazaría igual si se
    // colara). Distingue una entrega nueva de una re-visita a la misma
    // pantalla (el cliente puede volver a `/pedido/[id]` después).
    await writeAudit(tx, {
      actorType: "CUSTOMER",
      actorId: params.userId,
      action: "code.delivered",
      entityType: "order",
      entityId: order.orderId,
      metadata: { codeIds: allIds, newlyDelivered: newlyDeliveredIds.length, repeatView: newlyDeliveredIds.length === 0 },
    });

    return {
      orderNumber: orderRows[0].order_number,
      deliveredAt: new Date(orderRows[0].delivered_at),
      codes,
    };
  });
}

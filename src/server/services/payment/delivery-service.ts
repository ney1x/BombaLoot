import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { createDb, withTransaction } from "../../db/client";
import type { ValidatedSession } from "../../auth/session";
import { decryptCode } from "../../crypto/codes";
import { writeAudit, type AuditAction } from "../audit";
import { codesDeliveredEmail, sendMail } from "../mailer";
import { loadOwnedOrder } from "./order-access";
import { getOrderByIdAdmin, type OrderView } from "../checkout-service";
import { AdminOrderNotFoundError, NoDeliveredCodesError, OrderNotPaidError } from "../errors";
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

/**
 * El núcleo de "entregar" — compartido entre el cliente (`deliverOrderCodes`,
 * pide sus propios códigos en claro) y soporte (`adminDeliverOrderCodes`,
 * solo confirma que se mandó, nunca ve el código). El actor de auditoría es
 * el único parámetro que cambia entre los dos.
 */
async function runDelivery(
  pool: Pool,
  order: OrderView,
  auditActor: {
    actorType: "CUSTOMER" | "ADMIN" | "SUPPORT" | "SUPERADMIN";
    actorId?: string;
    action: AuditAction;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<{ isNewDelivery: boolean; value: DeliverOrderCodesResult }> {
  const result = await withTransaction(pool, async (tx) => {
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
    // pantalla (el cliente puede volver a `/pedido/[id]` después, o soporte
    // puede reintentar la entrega manual sobre un pedido ya entregado).
    await writeAudit(tx, {
      actorType: auditActor.actorType,
      actorId: auditActor.actorId,
      action: auditActor.action,
      entityType: "order",
      entityId: order.orderId,
      metadata: { codeIds: allIds, newlyDelivered: newlyDeliveredIds.length, repeatView: newlyDeliveredIds.length === 0 },
      ip: auditActor.ip,
      userAgent: auditActor.userAgent,
    });

    return {
      isNewDelivery: newlyDeliveredIds.length > 0,
      value: {
        orderNumber: orderRows[0].order_number,
        deliveredAt: new Date(orderRows[0].delivered_at),
        codes,
      },
    };
  });

  // Fuera de la transacción a propósito: el envío es una llamada de red al
  // proveedor de email, no algo que deba retener una conexión/lock de la
  // base mientras corre. Solo en la entrega NUEVA (no en cada revisita a
  // `/pedido/[id]`) — de lo contrario, cada recarga de la página le
  // reenviaría el mismo código por correo.
  if (result.isNewDelivery) {
    await sendMail({
      to: order.email,
      subject: `Tu código — pedido #${result.value.orderNumber}`,
      text: codesDeliveredEmail(result.value.orderNumber, result.value.codes),
    });
  }

  return result;
}

export async function deliverOrderCodes(
  pool: Pool,
  params: { orderId: string; accessToken?: string; userId?: string },
): Promise<DeliverOrderCodesResult> {
  const order = await loadOwnedOrder(pool, params);

  if (order.paymentStatus !== "PAID" || order.deliveryStatus === "UNAVAILABLE") {
    throw new OrderNotFoundError();
  }

  const result = await runDelivery(pool, order, {
    actorType: "CUSTOMER",
    actorId: params.userId,
    action: "code.delivered",
  });

  return result.value;
}

/**
 * Entrega manual por soporte: para cuando el flujo normal del cliente en
 * `/pedido/[id]` nunca llegó a completarse (token de acceso perdido, el
 * fetch de códigos falló en silencio, o cualquier otra razón) — el pago ya
 * está confirmado pero ningún código pasó nunca a `DELIVERED`, así que
 * `ResendCodesAction` no tiene nada que reenviar todavía. Mismo camino que
 * `deliverOrderCodes` (descifra, marca `DELIVERED`, manda el email), pero
 * sin exigir el token/sesión del dueño — la autorización acá es el rol
 * admin/support de quien llama (verificado por la ruta), no la propiedad
 * del pedido. Por eso, a diferencia de `deliverOrderCodes`, nunca devuelve
 * el código en claro — mismo criterio que `resendDeliveredCodesEmail`.
 */
export async function adminDeliverOrderCodes(
  pool: Pool,
  actor: ValidatedSession,
  orderId: string,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ orderNumber: string; email: string; codeCount: number }> {
  const order = await getOrderByIdAdmin(pool, orderId);
  if (!order) throw new AdminOrderNotFoundError(orderId);
  if (order.paymentStatus !== "PAID") throw new OrderNotPaidError(orderId, order.paymentStatus);

  const result = await runDelivery(pool, order, {
    actorType: actor.role,
    actorId: actor.userId,
    action: "code.delivered_by_support",
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return {
    orderNumber: result.value.orderNumber,
    email: order.email,
    codeCount: result.value.codes.length,
  };
}

/**
 * Reenvío de soporte: cuando el correo original no llegó (o el comprador
 * nunca lo guardó) y el admin/SUPPORT necesita ayudarlo sin poder ver el
 * código él mismo. Descifra server-side y lo manda de nuevo al email DEL
 * PEDIDO — nunca se devuelve el texto plano al llamador ni se audita (mismo
 * criterio que `deliverOrderCodes`: `writeAudit` rechaza cualquier clave que
 * huela a secreto, y acá tampoco hace falta, alcanza con los ids).
 *
 * Solo códigos ya `DELIVERED` — si el pedido nunca llegó a entregarse, no
 * hay nada que "reenviar" (ese es el flujo normal de `/pedido/[id]`, no
 * este). No cambia ningún estado: es un reenvío, no una entrega nueva.
 */
export async function resendDeliveredCodesEmail(
  pool: Pool,
  actor: ValidatedSession,
  orderId: string,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ orderNumber: string; email: string; codeCount: number }> {
  const db = createDb(pool);
  const { rows: orderRows } = (await db.execute(
    sql`SELECT order_number, email FROM orders WHERE id = ${orderId}::uuid`,
  )) as unknown as { rows: Array<{ order_number: string; email: string }> };
  const order = orderRows[0];
  if (!order) throw new AdminOrderNotFoundError(orderId);

  const { rows: codeRows } = (await db.execute(sql`
    SELECT c.product_id, oi.game_label, oi.denomination, oi.unit,
           c.secret_cipher, c.secret_nonce, c.secret_tag
      FROM codes c
      JOIN order_items oi ON oi.id = c.order_item_id
     WHERE oi.order_id = ${orderId}::uuid AND c.status = 'DELIVERED'
     ORDER BY oi.game_label, oi.denomination
  `)) as unknown as {
    rows: Array<{
      product_id: string;
      game_label: string;
      denomination: string;
      unit: string;
      secret_cipher: Buffer;
      secret_nonce: Buffer;
      secret_tag: Buffer;
    }>;
  };

  if (codeRows.length === 0) throw new NoDeliveredCodesError();

  const codes: DeliveredCode[] = codeRows.map((row) => ({
    productId: row.product_id,
    gameLabel: row.game_label,
    denomination: row.denomination,
    unit: row.unit,
    code: decryptCode({ cipher: row.secret_cipher, nonce: row.secret_nonce, tag: row.secret_tag }),
  }));

  await sendMail({
    to: order.email,
    subject: `Tu código — pedido #${order.order_number}`,
    text: codesDeliveredEmail(order.order_number, codes),
  });

  await writeAudit(db, {
    actorType: actor.role,
    actorId: actor.userId,
    action: "code.resent_by_support",
    entityType: "order",
    entityId: orderId,
    metadata: { codeCount: codes.length },
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { orderNumber: order.order_number, email: order.email, codeCount: codes.length };
}

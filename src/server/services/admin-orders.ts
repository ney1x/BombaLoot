import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { withTransaction, type Db } from "../db/client";
import type { ValidatedSession } from "../auth/session";
import { deriveOrderStatus, type OrderStatus } from "./checkout-service";
import { AdminOrderNotFoundError, OrderNotCancellableError } from "./errors";
import { writeAudit } from "./audit";

/**
 * Vista operativa de pedidos para el admin. A diferencia de
 * `getOrderForUser`/`listOrdersForUser` (fase 4, filtran por dueño), acá
 * el admin ve todos los pedidos — el guard de la ruta (`requireAdminOrSupportApi`)
 * es lo que autoriza eso, no un filtro de `user_id` en la consulta.
 *
 * `orderStatus` sigue sin ser una columna: se deriva con la misma
 * `deriveOrderStatus` que ya usa el resto del sistema (fase 4), para que
 * el admin nunca vea un estado distinto del que ve el cliente en `/pedido`.
 */

export const orderFiltersSchema = z.object({
  orderNumber: z.string().trim().max(64).optional(),
  email: z.string().trim().max(320).optional(),
  status: z
    .enum([
      "PENDING_PAYMENT",
      "PAID_PENDING_DELIVERY",
      "PAID_AWAITING_REFUND",
      "COMPLETED",
      "REFUNDED",
      "PAYMENT_EXPIRED",
      "FAILED",
    ])
    .optional(),
  paymentMethod: z.string().trim().max(32).optional(),
  owner: z.enum(["user", "guest"]).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type OrderFilters = z.infer<typeof orderFiltersSchema>;

export interface AdminOrderSummary {
  orderId: string;
  orderNumber: string;
  email: string;
  userId: string | null;
  paymentMethod: string | null;
  totalCop: number;
  paymentStatus: string;
  deliveryStatus: string;
  orderStatus: OrderStatus;
  createdAt: Date;
}

interface OrderSummaryRow {
  id: string;
  order_number: string;
  email: string;
  user_id: string | null;
  payment_method: string | null;
  total_cop: number;
  payment_status: string;
  delivery_status: string;
  payment_expires_at: string | null;
  created_at: string;
}

export async function listOrdersAdmin(db: Db, filters: OrderFilters): Promise<AdminOrderSummary[]> {
  const conditions = [sql`1=1`];
  if (filters.orderNumber) conditions.push(sql`order_number ILIKE ${"%" + filters.orderNumber + "%"}`);
  if (filters.email) conditions.push(sql`email ILIKE ${"%" + filters.email + "%"}`);
  if (filters.paymentMethod) conditions.push(sql`payment_method = ${filters.paymentMethod}`);
  if (filters.owner === "user") conditions.push(sql`user_id IS NOT NULL`);
  if (filters.owner === "guest") conditions.push(sql`user_id IS NULL`);
  if (filters.dateFrom) conditions.push(sql`created_at >= ${filters.dateFrom}::timestamptz`);
  if (filters.dateTo) conditions.push(sql`created_at <= ${filters.dateTo}::timestamptz`);

  const where = conditions.reduce((acc, c) => sql`${acc} AND ${c}`);

  const { rows } = (await db.execute(sql`
    SELECT id, order_number, email, user_id, payment_method, total_cop,
           payment_status, delivery_status, payment_expires_at, created_at
      FROM orders
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT ${filters.limit}
  `)) as unknown as { rows: OrderSummaryRow[] };

  const summaries = rows.map((row) => {
    const paymentExpiresAt = row.payment_expires_at ? new Date(row.payment_expires_at) : null;
    return {
      orderId: row.id,
      orderNumber: row.order_number,
      email: row.email,
      userId: row.user_id,
      paymentMethod: row.payment_method,
      totalCop: Number(row.total_cop),
      paymentStatus: row.payment_status,
      deliveryStatus: row.delivery_status,
      orderStatus: deriveOrderStatus({
        paymentStatus: row.payment_status,
        deliveryStatus: row.delivery_status,
        paymentExpiresAt,
      }),
      createdAt: new Date(row.created_at),
    };
  });

  // `status` es derivado, no una columna — se filtra acá, después de
  // calcularlo con la misma función que usa el resto del sistema.
  return filters.status ? summaries.filter((o) => o.orderStatus === filters.status) : summaries;
}

/* ────────────────────────── detalle ────────────────────────── */

export interface AdminOrderDetail extends AdminOrderSummary {
  buyerName: string | null;
  subtotalCop: number;
  discountCop: number;
  paidAt: Date | null;
  deliveredAt: Date | null;
  lastPaymentError: string | null;
  items: Array<{
    productId: string;
    gameLabel: string;
    denomination: string;
    unit: string;
    quantity: number;
    unitPriceCop: number;
    lineTotalCop: number;
  }>;
  codes: Array<{
    id: string;
    status: string;
    fingerprint: string;
    gameLabel: string;
    denomination: string;
    unit: string;
  }>;
  paymentIntents: Array<{
    id: string;
    provider: string;
    providerRef: string | null;
    status: string;
    amountCop: number;
    createdAt: Date;
  }>;
  refundRequests: Array<{
    id: string;
    provider: string;
    status: string;
    amountCop: number | null;
    requestedAt: Date;
    completedAt: Date | null;
  }>;
  auditLog: Array<{
    id: number;
    occurredAt: Date;
    actorType: string;
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }>;
}

export async function getOrderDetailAdmin(db: Db, orderId: string): Promise<AdminOrderDetail | null> {
  const { rows: orderRows } = (await db.execute(sql`
    SELECT id, order_number, email, user_id, buyer_name, payment_method, subtotal_cop, discount_cop, total_cop,
           payment_status, delivery_status, payment_expires_at, paid_at, delivered_at, last_payment_error, created_at
      FROM orders WHERE id = ${orderId}::uuid
  `)) as unknown as {
    rows: Array<{
      id: string;
      order_number: string;
      email: string;
      user_id: string | null;
      buyer_name: string | null;
      payment_method: string | null;
      subtotal_cop: number;
      discount_cop: number;
      total_cop: number;
      payment_status: string;
      delivery_status: string;
      payment_expires_at: string | null;
      paid_at: string | null;
      delivered_at: string | null;
      last_payment_error: string | null;
      created_at: string;
    }>;
  };
  const order = orderRows[0];
  if (!order) return null;

  const [itemRows, codeRows, intentRows, refundRows, auditRows] = await Promise.all([
    db.execute(sql`
      SELECT product_id, game_label, denomination, unit, quantity, unit_price_cop, line_total_cop
        FROM order_items WHERE order_id = ${orderId}::uuid ORDER BY game_label, denomination
    `) as unknown as Promise<{
      rows: Array<{
        product_id: string;
        game_label: string;
        denomination: string;
        unit: string;
        quantity: number;
        unit_price_cop: number;
        line_total_cop: number;
      }>;
    }>,
    db.execute(sql`
      SELECT c.id, c.status, c.secret_fingerprint, oi.game_label, oi.denomination, oi.unit
        FROM codes c JOIN order_items oi ON oi.id = c.order_item_id
       WHERE oi.order_id = ${orderId}::uuid
       ORDER BY oi.game_label, oi.denomination, c.created_at
    `) as unknown as Promise<{
      rows: Array<{
        id: string;
        status: string;
        secret_fingerprint: Buffer;
        game_label: string;
        denomination: string;
        unit: string;
      }>;
    }>,
    db.execute(sql`
      SELECT id, provider, provider_ref, status, amount_cop, created_at
        FROM payment_intents WHERE order_id = ${orderId}::uuid ORDER BY created_at DESC
    `) as unknown as Promise<{
      rows: Array<{
        id: string;
        provider: string;
        provider_ref: string | null;
        status: string;
        amount_cop: number;
        created_at: string;
      }>;
    }>,
    db.execute(sql`
      SELECT id, provider, status, amount_cop, requested_at, completed_at
        FROM refund_requests WHERE order_id = ${orderId}::uuid ORDER BY requested_at DESC
    `) as unknown as Promise<{
      rows: Array<{
        id: string;
        provider: string;
        status: string;
        amount_cop: number | null;
        requested_at: string;
        completed_at: string | null;
      }>;
    }>,
    db.execute(sql`
      SELECT id, occurred_at, actor_type, actor_id, action, entity_type, entity_id, metadata
        FROM audit_logs
       WHERE (entity_type = 'order' AND entity_id = ${orderId})
          OR (entity_type = 'refund_request' AND entity_id IN (
                SELECT id::text FROM refund_requests WHERE order_id = ${orderId}::uuid
              ))
       ORDER BY occurred_at DESC
       LIMIT 100
    `) as unknown as Promise<{
      rows: Array<{
        id: number;
        occurred_at: string;
        actor_type: string;
        actor_id: string | null;
        action: string;
        entity_type: string;
        entity_id: string;
        metadata: Record<string, unknown>;
      }>;
    }>,
  ]);

  const paymentExpiresAt = order.payment_expires_at ? new Date(order.payment_expires_at) : null;

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    email: order.email,
    userId: order.user_id,
    buyerName: order.buyer_name,
    paymentMethod: order.payment_method,
    subtotalCop: Number(order.subtotal_cop),
    discountCop: Number(order.discount_cop),
    totalCop: Number(order.total_cop),
    paymentStatus: order.payment_status,
    deliveryStatus: order.delivery_status,
    orderStatus: deriveOrderStatus({
      paymentStatus: order.payment_status,
      deliveryStatus: order.delivery_status,
      paymentExpiresAt,
    }),
    paidAt: order.paid_at ? new Date(order.paid_at) : null,
    deliveredAt: order.delivered_at ? new Date(order.delivered_at) : null,
    lastPaymentError: order.last_payment_error,
    createdAt: new Date(order.created_at),
    items: itemRows.rows.map((i) => ({
      productId: i.product_id,
      gameLabel: i.game_label,
      denomination: i.denomination,
      unit: i.unit,
      quantity: i.quantity,
      unitPriceCop: Number(i.unit_price_cop),
      lineTotalCop: Number(i.line_total_cop),
    })),
    codes: codeRows.rows.map((c) => ({
      id: c.id,
      status: c.status,
      fingerprint: c.secret_fingerprint.toString("hex").slice(0, 16),
      gameLabel: c.game_label,
      denomination: c.denomination,
      unit: c.unit,
    })),
    paymentIntents: intentRows.rows.map((p) => ({
      id: p.id,
      provider: p.provider,
      providerRef: p.provider_ref,
      status: p.status,
      amountCop: Number(p.amount_cop),
      createdAt: new Date(p.created_at),
    })),
    refundRequests: refundRows.rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      status: r.status,
      amountCop: r.amount_cop === null ? null : Number(r.amount_cop),
      requestedAt: new Date(r.requested_at),
      completedAt: r.completed_at ? new Date(r.completed_at) : null,
    })),
    auditLog: auditRows.rows.map((a) => ({
      id: Number(a.id),
      occurredAt: new Date(a.occurred_at),
      actorType: a.actor_type,
      actorId: a.actor_id,
      action: a.action,
      entityType: a.entity_type,
      entityId: a.entity_id,
      metadata: a.metadata,
    })),
  };
}

/**
 * Cancela por sospecha de fraude un pedido que todavía no cobró — libera
 * los códigos reservados de vuelta al inventario vendible, mismo mecanismo
 * que `sweepExpiredPendingOrders` (el barrido automático de ventana de pago
 * vencida), pero disparado a mano por un admin/SUPPORT con un motivo
 * explícito en vez de por el paso del tiempo.
 *
 * Un pedido ya PAID no pasa por acá: ese caso es un reembolso (dinero real
 * de por medio), y ya existe ese flujo completo en `admin-refunds.ts` — acá
 * solo se corta la operación que todavía no le costó nada al comprador.
 */
export async function cancelOrderForFraud(
  pool: Pool,
  actor: ValidatedSession,
  orderId: string,
  reason: string,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ codesReleased: number }> {
  return withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(sql`
      SELECT id, payment_status FROM orders WHERE id = ${orderId}::uuid FOR UPDATE
    `)) as unknown as { rows: { id: string; payment_status: string }[] };
    const order = rows[0];
    if (!order) throw new AdminOrderNotFoundError(orderId);
    if (order.payment_status !== "PENDING") {
      throw new OrderNotCancellableError(orderId, order.payment_status);
    }

    await tx.execute(sql`
      UPDATE orders SET payment_status = 'FAILED', last_payment_error = ${reason}, updated_at = now()
       WHERE id = ${orderId}::uuid
    `);

    const { rowCount } = (await tx.execute(sql`
      UPDATE codes c
         SET status = 'AVAILABLE', reservation_id = NULL, reserved_until = NULL, order_item_id = NULL
        FROM order_items oi
       WHERE c.order_item_id = oi.id
         AND oi.order_id = ${orderId}::uuid
         AND c.status = 'RESERVED'
    `)) as unknown as { rowCount: number | null };

    await writeAudit(tx, {
      actorType: actor.role === "ADMIN" ? "ADMIN" : "SUPPORT",
      actorId: actor.userId,
      action: "order.cancelled_fraud",
      entityType: "order",
      entityId: orderId,
      metadata: { reason, codesReleased: rowCount ?? 0 },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { codesReleased: rowCount ?? 0 };
  });
}

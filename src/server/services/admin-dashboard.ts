import "server-only";

import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { listCatalogProducts } from "./catalog";

/**
 * Métricas del dashboard admin. Todo lectura, sin mutación — no hay nada
 * que auditar acá (a diferencia de las acciones de fases posteriores).
 *
 * El stock bajo/agotado reutiliza `listCatalogProducts` (fase 4) en vez de
 * reimplementar el cálculo de disponibilidad: es el mismo `stock` que ya
 * ve el catálogo público, mismo predicado que el reclamo de inventario. Un
 * segundo cálculo acá sería exactamente el tipo de "columna duplicada" que
 * el diseño de fase 6 prohíbe para el stock.
 */

export interface DashboardMetrics {
  salesTodayCop: number;
  salesMonthCop: number;
  ordersPending: number;
  ordersPaidToday: number;
  ordersDeliveryProblems: number;
  refundsPending: number;
  refundsManualReview: number;
  productsLowStock: number;
  productsOutOfStock: number;
}

interface OrdersAggregateRow {
  sales_today_cop: string | null;
  sales_month_cop: string | null;
  orders_pending: string;
  orders_paid_today: string;
  orders_delivery_problems: string;
}

interface RefundsAggregateRow {
  refunds_pending: string;
  refunds_manual_review: string;
}

/**
 * Sin try/catch, un fallo acá (timeout, conexión caída) tira el `Promise.all`
 * de `page.tsx` entero — la única red que queda es `error.tsx` del segmento
 * `/admin`, que muestra un mensaje genérico sin detalle. Acá adentro sí
 * logueamos el error real (mismo criterio que el resto del proyecto:
 * `respond.ts` nunca manda `error.message` crudo al cliente, solo a
 * `console.error` del servidor) antes de dejarlo subir.
 */
export async function getDashboardMetrics(db: Db): Promise<DashboardMetrics> {
  try {
    const { rows: orderRows } = (await db.execute(sql`
      SELECT
        SUM(total_cop) FILTER (WHERE payment_status = 'PAID' AND paid_at >= date_trunc('day', now())) AS sales_today_cop,
        SUM(total_cop) FILTER (WHERE payment_status = 'PAID' AND paid_at >= date_trunc('month', now())) AS sales_month_cop,
        COUNT(*) FILTER (WHERE payment_status = 'PENDING') AS orders_pending,
        COUNT(*) FILTER (WHERE payment_status = 'PAID' AND paid_at >= date_trunc('day', now())) AS orders_paid_today,
        COUNT(*) FILTER (WHERE payment_status = 'PAID' AND delivery_status = 'UNAVAILABLE') AS orders_delivery_problems
      FROM orders
    `)) as unknown as { rows: OrdersAggregateRow[] };

    const { rows: refundRows } = (await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('PENDING_REFUND', 'REFUND_INITIATED')) AS refunds_pending,
        COUNT(*) FILTER (WHERE status = 'MANUAL_REVIEW_REQUIRED') AS refunds_manual_review
      FROM refund_requests
    `)) as unknown as { rows: RefundsAggregateRow[] };

    const products = await listCatalogProducts(db);
    const productsLowStock = products.filter((p) => p.stock === "low").length;
    const productsOutOfStock = products.filter((p) => p.stock === "out").length;

    const o = orderRows[0];
    const r = refundRows[0];

    return {
      salesTodayCop: Number(o.sales_today_cop ?? 0),
      salesMonthCop: Number(o.sales_month_cop ?? 0),
      ordersPending: Number(o.orders_pending),
      ordersPaidToday: Number(o.orders_paid_today),
      ordersDeliveryProblems: Number(o.orders_delivery_problems),
      refundsPending: Number(r.refunds_pending),
      refundsManualReview: Number(r.refunds_manual_review),
      productsLowStock,
      productsOutOfStock,
    };
  } catch (error) {
    console.error("[admin-dashboard] no se pudieron calcular las métricas:", error);
    throw new Error("No se pudieron calcular las métricas del dashboard.");
  }
}

/* ────────────────────────── ventas por admin ────────────────────────── */

export interface AdminEarnings {
  /** `null` = códigos sin lote/sin admin asignado (carga vieja, previa a este esquema) — se muestra aparte, nunca se mezcla en la fila de un admin real. */
  adminId: string | null;
  adminLabel: string;
  codesSoldMonth: number;
  revenueMonthCop: number;
  codesSoldAllTime: number;
  revenueAllTimeCop: number;
}

interface AdminEarningsRow {
  admin_id: string | null;
  admin_label: string | null;
  codes_sold_month: string;
  revenue_month_cop: string | null;
  codes_sold_all_time: string;
  revenue_all_time_cop: string | null;
}

/**
 * A quién se le atribuye cada venta: el admin que cargó el LOTE del código
 * concreto que se vendió (`codes.batch_id` → `code_batches.uploaded_by`),
 * no el producto en sí — dos admins pueden cargar códigos del mismo
 * producto, así que la unidad de atribución tiene que ser el código
 * individual, no el pedido ni el order_item. El precio de esa unidad
 * (`order_items.unit_price_cop`) es lo que se suma por admin.
 *
 * Solo cuenta lo efectivamente cobrado y no devuelto: `orders.payment_status
 * = 'PAID'` (mismo filtro que `salesMonthCop`/`salesTodayCop` arriba —
 * un pedido REFUNDED no es "ganancia" de nadie) y el código en
 * PAID/DELIVERED (el estado que ya implica que su pedido se pagó).
 */
export async function getAdminEarnings(db: Db): Promise<AdminEarnings[]> {
  try {
    const { rows } = (await db.execute(sql`
      SELECT u.id AS admin_id,
             COALESCE(u.name, u.email) AS admin_label,
             COUNT(*) FILTER (WHERE o.paid_at >= date_trunc('month', now())) AS codes_sold_month,
             SUM(oi.unit_price_cop) FILTER (WHERE o.paid_at >= date_trunc('month', now())) AS revenue_month_cop,
             COUNT(*) AS codes_sold_all_time,
             SUM(oi.unit_price_cop) AS revenue_all_time_cop
        FROM codes c
        JOIN order_items oi ON oi.id = c.order_item_id
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN code_batches b ON b.id = c.batch_id
        LEFT JOIN users u ON u.id = b.uploaded_by
       WHERE o.payment_status = 'PAID' AND c.status IN ('PAID', 'DELIVERED')
       GROUP BY u.id, u.name, u.email
       ORDER BY revenue_all_time_cop DESC NULLS LAST
    `)) as unknown as { rows: AdminEarningsRow[] };

    return rows.map((row) => ({
      adminId: row.admin_id,
      adminLabel: row.admin_label ?? "Sin admin asignado",
      codesSoldMonth: Number(row.codes_sold_month),
      revenueMonthCop: Number(row.revenue_month_cop ?? 0),
      codesSoldAllTime: Number(row.codes_sold_all_time),
      revenueAllTimeCop: Number(row.revenue_all_time_cop ?? 0),
    }));
  } catch (error) {
    console.error("[admin-dashboard] no se pudieron calcular las ganancias por admin:", error);
    throw new Error("No se pudieron calcular las ganancias por admin.");
  }
}

import "server-only";

import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { listCatalogProducts } from "./catalog";
import { usdExchangeRate } from "./payment/payment-intent-service";

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
  netMonthCop: number;
  codesSoldAllTime: number;
  revenueAllTimeCop: number;
  netAllTimeCop: number;
}

interface AdminEarningsRow {
  admin_id: string | null;
  admin_label: string | null;
  codes_sold_month: string;
  revenue_month_cop: string | null;
  net_month_cop: string | null;
  codes_sold_all_time: string;
  revenue_all_time_cop: string | null;
  net_all_time_cop: string | null;
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
 *
 * El NETO prorratea la comisión del `payment_intent` de cada pedido entre
 * sus códigos, en la misma proporción que ya reparte el bruto (precio del
 * código / total del pedido) — un pedido con denominaciones de dos admins
 * distintos reparte la comisión de esa transacción entre los dos, a
 * prorrata. Si el pedido no tiene comisión registrada (ventas de antes de
 * esta feature, o el cálculo falló) el ratio queda en 1 — neto = bruto para
 * esa fila, no un cero engañoso.
 */
export async function getAdminEarnings(db: Db): Promise<AdminEarnings[]> {
  try {
    const { rows } = (await db.execute(sql`
      SELECT u.id AS admin_id,
             COALESCE(u.name, u.email) AS admin_label,
             COUNT(*) FILTER (WHERE o.paid_at >= date_trunc('month', now())) AS codes_sold_month,
             SUM(oi.unit_price_cop) FILTER (WHERE o.paid_at >= date_trunc('month', now())) AS revenue_month_cop,
             SUM(oi.unit_price_cop * r.net_ratio) FILTER (WHERE o.paid_at >= date_trunc('month', now())) AS net_month_cop,
             COUNT(*) AS codes_sold_all_time,
             SUM(oi.unit_price_cop) AS revenue_all_time_cop,
             SUM(oi.unit_price_cop * r.net_ratio) AS net_all_time_cop
        FROM codes c
        JOIN order_items oi ON oi.id = c.order_item_id
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN code_batches b ON b.id = c.batch_id
        LEFT JOIN users u ON u.id = b.uploaded_by
        LEFT JOIN LATERAL (
          SELECT currency, amount_cop, amount_usd, fee_cop, fee_usd
            FROM payment_intents
           WHERE order_id = o.id AND status = 'APPROVED'
           ORDER BY updated_at DESC
           LIMIT 1
        ) pi ON true
        CROSS JOIN LATERAL (
          SELECT CASE
            WHEN pi.currency = 'COP' AND pi.fee_cop IS NOT NULL AND pi.amount_cop > 0
              THEN 1 - (pi.fee_cop / pi.amount_cop)
            WHEN pi.currency = 'USD' AND pi.fee_usd IS NOT NULL AND pi.amount_usd > 0
              THEN 1 - (pi.fee_usd / pi.amount_usd)
            ELSE 1
          END AS net_ratio
        ) r
       WHERE o.payment_status = 'PAID' AND c.status IN ('PAID', 'DELIVERED')
       GROUP BY u.id, u.name, u.email
       ORDER BY revenue_all_time_cop DESC NULLS LAST
    `)) as unknown as { rows: AdminEarningsRow[] };

    return rows.map((row) => ({
      adminId: row.admin_id,
      adminLabel: row.admin_label ?? "Sin admin asignado",
      codesSoldMonth: Number(row.codes_sold_month),
      revenueMonthCop: Number(row.revenue_month_cop ?? 0),
      netMonthCop: Number(row.net_month_cop ?? 0),
      codesSoldAllTime: Number(row.codes_sold_all_time),
      revenueAllTimeCop: Number(row.revenue_all_time_cop ?? 0),
      netAllTimeCop: Number(row.net_all_time_cop ?? 0),
    }));
  } catch (error) {
    console.error("[admin-dashboard] no se pudieron calcular las ganancias por admin:", error);
    throw new Error("No se pudieron calcular las ganancias por admin.");
  }
}

/* ────────────────────────── ventas por método de pago ────────────────────────── */

export interface PaymentMethodEarnings {
  provider: "WOMPI" | "PAYPAL";
  ordersAllTime: number;
  grossAllTimeCop: number;
  feeAllTimeCop: number;
  netAllTimeCop: number;
  /** true si ALGUNA de las transacciones sumadas es estimada (Wompi) — la fila entera se marca así en vez de mentir con un total "exacto". */
  hasEstimatedFees: boolean;
}

interface PaymentMethodEarningsRow {
  provider: "WOMPI" | "PAYPAL";
  orders_all_time: string;
  gross_all_time_cop: string | null;
  fee_all_time_cop: string | null;
  has_estimated_fees: boolean;
}

/**
 * Bruto/comisión/neto por proveedor, sitewide (no cruzado con admin — ver
 * `getAdminEarnings` para esa vista). El bruto de PayPal se pasa a COP con
 * `USD_COP_EXCHANGE_RATE` vigente HOY, no la del momento de cada venta —
 * distinto de `getAdminEarnings`, que nunca necesita cruzar moneda porque
 * ahí lo único que se sumaba siempre fue COP. Es una vista agregada de
 * referencia, no una que tenga que cuadrar centavo a centavo con un
 * estado de cuenta.
 */
export async function getPaymentMethodEarnings(db: Db): Promise<PaymentMethodEarnings[]> {
  try {
    const { rows } = (await db.execute(sql`
      SELECT provider,
             COUNT(*) AS orders_all_time,
             SUM(CASE WHEN currency = 'COP' THEN amount_cop ELSE amount_usd * ${usdExchangeRate()} END) AS gross_all_time_cop,
             SUM(CASE WHEN currency = 'COP' THEN COALESCE(fee_cop, 0) ELSE COALESCE(fee_usd, 0) * ${usdExchangeRate()} END) AS fee_all_time_cop,
             bool_or(fee_is_estimated) AS has_estimated_fees
        FROM payment_intents
       WHERE status = 'APPROVED'
       GROUP BY provider
       ORDER BY gross_all_time_cop DESC NULLS LAST
    `)) as unknown as { rows: PaymentMethodEarningsRow[] };

    return rows.map((row) => {
      const gross = Number(row.gross_all_time_cop ?? 0);
      const fee = Number(row.fee_all_time_cop ?? 0);
      return {
        provider: row.provider,
        ordersAllTime: Number(row.orders_all_time),
        grossAllTimeCop: gross,
        feeAllTimeCop: fee,
        netAllTimeCop: gross - fee,
        hasEstimatedFees: row.has_estimated_fees,
      };
    });
  } catch (error) {
    console.error("[admin-dashboard] no se pudieron calcular las ganancias por método de pago:", error);
    throw new Error("No se pudieron calcular las ganancias por método de pago.");
  }
}

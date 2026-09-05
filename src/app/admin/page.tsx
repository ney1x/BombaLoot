import type { Metadata } from "next";
import Link from "next/link";
import styles from "./dashboard.module.css";
import shared from "./shared.module.css";
import { getCurrentSession } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { formatCop } from "@/lib/products";
import {
  getAdminEarnings,
  getDashboardMetrics,
  getPaymentMethodEarnings,
} from "@/server/services/admin-dashboard";
import { getPaymentFeeSettings } from "@/server/services/payment-fee-settings";
import { getHealthReport, type HealthCheck, type HealthStatus } from "@/server/services/admin-health";
import { PaymentFeeSettingsForm } from "@/components/admin/PaymentFeeSettingsForm";

export const metadata: Metadata = { title: "Dashboard — Admin BombaLoot" };

const PROVIDER_LABEL: Record<"WOMPI" | "PAYPAL", string> = { WOMPI: "Wompi", PAYPAL: "PayPal" };

/**
 * Server Component: llama a los servicios directo (misma request, sin dar
 * la vuelta por `/api/admin/dashboard`). La ruta HTTP existe para que un
 * cliente que quiera refrescar sin recargar la página tenga a dónde pegarle
 * — hoy nada la consume todavía.
 */
export default async function AdminDashboardPage() {
  const [session, metrics, health, earnings, methodEarnings, feeSettings] = await Promise.all([
    getCurrentSession(),
    getDashboardMetrics(getDb()),
    getHealthReport(getPool()),
    getAdminEarnings(getDb()),
    getPaymentMethodEarnings(getDb()),
    getPaymentFeeSettings(getDb()),
  ]);

  const earningsTotal = earnings.reduce(
    (acc, e) => ({
      codesSoldMonth: acc.codesSoldMonth + e.codesSoldMonth,
      revenueMonthCop: acc.revenueMonthCop + e.revenueMonthCop,
      netMonthCop: acc.netMonthCop + e.netMonthCop,
      codesSoldAllTime: acc.codesSoldAllTime + e.codesSoldAllTime,
      revenueAllTimeCop: acc.revenueAllTimeCop + e.revenueAllTimeCop,
      netAllTimeCop: acc.netAllTimeCop + e.netAllTimeCop,
    }),
    { codesSoldMonth: 0, revenueMonthCop: 0, netMonthCop: 0, codesSoldAllTime: 0, revenueAllTimeCop: 0, netAllTimeCop: 0 },
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Dashboard</h1>

      <div className={styles.metricGroups}>
        <section className={styles.metricGroup}>
          <h2 className={styles.sectionTitle}>Ventas</h2>
          <div className={styles.metricsGrid}>
            <MetricCard label="Ventas hoy" value={formatCop(metrics.salesTodayCop)} />
            <MetricCard label="Ventas del mes" value={formatCop(metrics.salesMonthCop)} />
          </div>
        </section>

        <section className={styles.metricGroup}>
          <h2 className={styles.sectionTitle}>Ventas por admin</h2>
          <p className={shared.subtitle}>
            A quién se le atribuye cada venta: el admin que cargó el código concreto que se vendió, no el
            producto — así que dos admins pueden vender del mismo producto sin mezclarse.
          </p>
          <p className={shared.subtitle}>
            Neto = descontada la comisión del proveedor de pago del pedido correspondiente, a prorrata si el
            pedido mezcla códigos de más de un admin. La de Wompi es un estimado (ver tarifa más abajo); la de
            PayPal es la exacta que ellos mismos informan.
          </p>
          <div className={shared.tableWrap} style={{ marginTop: 10 }}>
            <table className={shared.table}>
              <thead>
                <tr>
                  <th scope="col">Admin</th>
                  <th scope="col">Códigos (mes)</th>
                  <th scope="col">Bruto del mes</th>
                  <th scope="col">Neto del mes</th>
                  <th scope="col">Códigos (total)</th>
                  <th scope="col">Bruto total</th>
                  <th scope="col">Neto total</th>
                </tr>
              </thead>
              <tbody>
                {earnings.map((e) => (
                  <tr key={e.adminId ?? "sin-asignar"}>
                    <td>{e.adminLabel}</td>
                    <td className="num-display">{e.codesSoldMonth}</td>
                    <td className="num-display">{formatCop(e.revenueMonthCop)}</td>
                    <td className="num-display">{formatCop(e.netMonthCop)}</td>
                    <td className="num-display">{e.codesSoldAllTime}</td>
                    <td className="num-display">{formatCop(e.revenueAllTimeCop)}</td>
                    <td className="num-display">{formatCop(e.netAllTimeCop)}</td>
                  </tr>
                ))}
                {earnings.length === 0 && (
                  <tr>
                    <td colSpan={7} className={shared.empty}>
                      Sin códigos vendidos todavía.
                    </td>
                  </tr>
                )}
                {earnings.length > 0 && (
                  <tr style={{ fontWeight: 700 }}>
                    <td>Total combinado</td>
                    <td className="num-display">{earningsTotal.codesSoldMonth}</td>
                    <td className="num-display">{formatCop(earningsTotal.revenueMonthCop)}</td>
                    <td className="num-display">{formatCop(earningsTotal.netMonthCop)}</td>
                    <td className="num-display">{earningsTotal.codesSoldAllTime}</td>
                    <td className="num-display">{formatCop(earningsTotal.revenueAllTimeCop)}</td>
                    <td className="num-display">{formatCop(earningsTotal.netAllTimeCop)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.metricGroup}>
          <h2 className={styles.sectionTitle}>Ventas por método de pago</h2>
          <p className={shared.subtitle}>Histórico completo, no solo el mes — bruto, comisión y neto por proveedor.</p>
          <div className={shared.tableWrap} style={{ marginTop: 10 }}>
            <table className={shared.table}>
              <thead>
                <tr>
                  <th scope="col">Método</th>
                  <th scope="col">Transacciones</th>
                  <th scope="col">Bruto</th>
                  <th scope="col">Comisión</th>
                  <th scope="col">Neto</th>
                </tr>
              </thead>
              <tbody>
                {methodEarnings.map((m) => (
                  <tr key={m.provider}>
                    <td>
                      {PROVIDER_LABEL[m.provider]}
                      {m.hasEstimatedFees && (
                        <span className={shared.badge} style={{ marginLeft: 8 }}>
                          estimado
                        </span>
                      )}
                    </td>
                    <td className="num-display">{m.ordersAllTime}</td>
                    <td className="num-display">{formatCop(m.grossAllTimeCop)}</td>
                    <td className="num-display">{formatCop(m.feeAllTimeCop)}</td>
                    <td className="num-display">{formatCop(m.netAllTimeCop)}</td>
                  </tr>
                ))}
                {methodEarnings.length === 0 && (
                  <tr>
                    <td colSpan={5} className={shared.empty}>
                      Sin pagos aprobados todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12 }}>
            <PaymentFeeSettingsForm
              initial={{
                wompiPercentageBp: feeSettings.wompiPercentageBp,
                wompiFixedCop: feeSettings.wompiFixedCop,
                wompiIvaBp: feeSettings.wompiIvaBp,
                updatedAt: feeSettings.updatedAt.toISOString(),
                updatedByName: feeSettings.updatedByName,
              }}
              canEdit={session?.role === "SUPERADMIN"}
            />
          </div>
        </section>

        <section className={styles.metricGroup}>
          <h2 className={styles.sectionTitle}>Pedidos</h2>
          <div className={styles.metricsGrid}>
            <MetricCard label="Pedidos pendientes" value={metrics.ordersPending} />
            <MetricCard label="Pedidos pagados hoy" value={metrics.ordersPaidToday} />
            <MetricCard
              label="Con problema de entrega"
              value={metrics.ordersDeliveryProblems}
              tone={metrics.ordersDeliveryProblems > 0 ? "warn" : undefined}
              href="/admin/pedidos"
            />
          </div>
        </section>

        <section className={styles.metricGroup}>
          <h2 className={styles.sectionTitle}>Reembolsos</h2>
          <div className={styles.metricsGrid}>
            <MetricCard
              label="Reembolsos pendientes"
              value={metrics.refundsPending}
              tone={metrics.refundsPending > 0 ? "warn" : undefined}
            />
            <MetricCard
              label="Requieren revisión manual"
              value={metrics.refundsManualReview}
              tone={metrics.refundsManualReview > 0 ? "alert" : undefined}
              href="/admin/reembolsos?status=MANUAL_REVIEW_REQUIRED"
            />
          </div>
        </section>

        <section className={styles.metricGroup}>
          <h2 className={styles.sectionTitle}>Inventario</h2>
          <div className={styles.metricsGrid}>
            <MetricCard
              label="Stock bajo"
              value={metrics.productsLowStock}
              tone={metrics.productsLowStock > 0 ? "warn" : undefined}
              href="/admin/inventario"
            />
            <MetricCard
              label="Agotados"
              value={metrics.productsOutOfStock}
              tone={metrics.productsOutOfStock > 0 ? "alert" : undefined}
              href="/admin/inventario"
            />
          </div>
        </section>
      </div>

      <section className={styles.healthSection}>
        <h2 className={styles.sectionTitle}>Health / Operación</h2>
        <div className={styles.healthGrid}>
          <HealthRow label="Base de datos" check={health.database} />
          <HealthRow label="Inventario / reservas" check={health.inventory} />
          <HealthRow label="Pagos (Wompi / PayPal)" check={health.payments} />
          <HealthRow label="Webhooks" check={health.webhooks} />
          <HealthRow label="Worker de reembolsos" check={health.refundWorker} />
          <HealthRow label="Conciliación de pagos" check={health.paymentReconciliation} />
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  tone?: "warn" | "alert";
  /** Cards con tone (algo que requiere atención) llevan a la vista relevante — nunca un dead end. */
  href?: string;
}) {
  const content = (
    <>
      <div className={styles.metricLabel}>{label}</div>
      <div className={`${styles.metricValue} num-display`}>{value}</div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={styles.metricCard} data-tone={tone}>
        {content}
      </Link>
    );
  }

  return (
    <div className={styles.metricCard} data-tone={tone}>
      {content}
    </div>
  );
}

const STATUS_LABEL: Record<HealthStatus, string> = {
  OK: "OK",
  WARNING: "WARNING",
  ERROR: "ERROR",
  NOT_CONFIGURED: "SIN CONFIGURAR",
};

function HealthRow({ label, check }: { label: string; check: HealthCheck }) {
  return (
    <div className={styles.healthRow}>
      <span className={styles.healthBadge} data-status={check.status}>
        {STATUS_LABEL[check.status]}
      </span>
      <div className={styles.healthBody}>
        <div className={styles.healthLabel}>{label}</div>
        <div className={styles.healthMessage}>{check.message}</div>
      </div>
      <div className={styles.healthMeta}>
        {check.latencyMs !== undefined && <span>{check.latencyMs}ms</span>}
        <span>{new Date(check.timestamp).toLocaleTimeString("es-CO")}</span>
      </div>
    </div>
  );
}

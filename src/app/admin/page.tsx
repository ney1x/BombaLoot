import type { Metadata } from "next";
import styles from "./dashboard.module.css";
import { getDb, getPool } from "@/server/db/client";
import { formatCop } from "@/lib/products";
import { getDashboardMetrics } from "@/server/services/admin-dashboard";
import { getHealthReport, type HealthCheck, type HealthStatus } from "@/server/services/admin-health";

export const metadata: Metadata = { title: "Dashboard — Admin Loadout" };

/**
 * Server Component: llama a los servicios directo (misma request, sin dar
 * la vuelta por `/api/admin/dashboard`). La ruta HTTP existe para que un
 * cliente que quiera refrescar sin recargar la página tenga a dónde pegarle
 * — hoy nada la consume todavía.
 */
export default async function AdminDashboardPage() {
  const [metrics, health] = await Promise.all([
    getDashboardMetrics(getDb()),
    getHealthReport(getPool()),
  ]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Dashboard</h1>

      <section className={styles.metricsGrid}>
        <MetricCard label="Ventas hoy" value={formatCop(metrics.salesTodayCop)} />
        <MetricCard label="Ventas del mes" value={formatCop(metrics.salesMonthCop)} />
        <MetricCard label="Pedidos pendientes" value={metrics.ordersPending} />
        <MetricCard label="Pedidos pagados hoy" value={metrics.ordersPaidToday} />
        <MetricCard
          label="Con problema de entrega"
          value={metrics.ordersDeliveryProblems}
          tone={metrics.ordersDeliveryProblems > 0 ? "warn" : undefined}
        />
        <MetricCard
          label="Reembolsos pendientes"
          value={metrics.refundsPending}
          tone={metrics.refundsPending > 0 ? "warn" : undefined}
        />
        <MetricCard
          label="Requieren revisión manual"
          value={metrics.refundsManualReview}
          tone={metrics.refundsManualReview > 0 ? "alert" : undefined}
        />
        <MetricCard
          label="Stock bajo"
          value={metrics.productsLowStock}
          tone={metrics.productsLowStock > 0 ? "warn" : undefined}
        />
        <MetricCard
          label="Agotados"
          value={metrics.productsOutOfStock}
          tone={metrics.productsOutOfStock > 0 ? "alert" : undefined}
        />
      </section>

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
}: {
  label: string;
  value: string | number;
  tone?: "warn" | "alert";
}) {
  return (
    <div className={styles.metricCard} data-tone={tone}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={`${styles.metricValue} num-display`}>{value}</div>
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

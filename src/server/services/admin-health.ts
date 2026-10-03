import "server-only";

import type { Pool } from "pg";
import { RECONCILE_STALE_MINUTES } from "./payment/reconciliation-service";

/**
 * Health checks reales del panel admin. Regla del diseño de fase 6:
 * ningún indicador puede decir "OK" porque sí — cada uno corre una consulta
 * de verdad y deriva el estado de un resultado real, con timeout.
 *
 * Lo que NO existe todavía (documentado, no simulado): un ping en vivo a
 * las APIs de Wompi/PayPal. Ninguno de los dos clientes (`wompi-client.ts`,
 * `paypal-client.ts`) expone un endpoint de healthcheck liviano — lo único
 * verificable sin gastar una llamada de negocio real es que las credenciales
 * estén configuradas. El indicador `payments` de acá refleja exactamente
 * eso, y lo dice en su mensaje: no es lo mismo que "Wompi está arriba".
 * Si más adelante se agrega un ping real, este es el lugar para cambiarlo.
 */

export type HealthStatus = "OK" | "WARNING" | "ERROR" | "NOT_CONFIGURED";

export interface HealthCheck {
  status: HealthStatus;
  timestamp: string;
  latencyMs?: number;
  message: string;
}

export interface HealthReport {
  database: HealthCheck;
  inventory: HealthCheck;
  payments: HealthCheck;
  webhooks: HealthCheck;
  refundWorker: HealthCheck;
  paymentReconciliation: HealthCheck;
}

const HEALTH_QUERY_TIMEOUT_MS = 3_000;

function now(): string {
  return new Date().toISOString();
}

/** Corre una promesa con techo de tiempo — un check colgado no debe colgar el dashboard entero. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout tras ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/* ────────────────────────── database ────────────────────────── */

async function checkDatabase(pool: Pool): Promise<HealthCheck> {
  const startedAt = Date.now();
  try {
    await withTimeout(pool.query("SELECT 1"), HEALTH_QUERY_TIMEOUT_MS);
    const latencyMs = Date.now() - startedAt;
    return {
      status: latencyMs > 1_000 ? "WARNING" : "OK",
      timestamp: now(),
      latencyMs,
      message: latencyMs > 1_000 ? "Latencia alta en la consulta de prueba" : "Conexión y consulta de prueba OK",
    };
  } catch (error) {
    return {
      status: "ERROR",
      timestamp: now(),
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? "No se pudo consultar la base" : "Error desconocido consultando la base",
    };
  }
}

/* ────────────────────────── inventory ────────────────────────── */

interface StuckReservationsRow {
  stuck_count: string;
}

const INVENTORY_STUCK_WARNING_THRESHOLD = 50;

/**
 * Códigos `RESERVED` cuya `reserved_until` ya pasó pero que todavía no
 * fueron recuperados por el reclamo ni por el barrido (`sweepExpiredReservations`).
 * Un puñado es normal y transitorio (la recuperación ocurre dentro del
 * propio reclamo, ver `inventory.ts`); una cola grande sugiere que el
 * barrido dejó de correr.
 */
async function checkInventory(pool: Pool): Promise<HealthCheck> {
  const startedAt = Date.now();
  try {
    const { rows } = (await withTimeout(
      pool.query(
        `SELECT count(*) AS stuck_count FROM codes
          WHERE status = 'RESERVED' AND order_item_id IS NULL AND reserved_until < now() - interval '5 minutes'`,
      ),
      HEALTH_QUERY_TIMEOUT_MS,
    )) as { rows: StuckReservationsRow[] };

    const stuckCount = Number(rows[0].stuck_count);
    const latencyMs = Date.now() - startedAt;

    if (stuckCount > INVENTORY_STUCK_WARNING_THRESHOLD) {
      return {
        status: "WARNING",
        timestamp: now(),
        latencyMs,
        message: `${stuckCount} códigos reservados vencidos sin recuperar hace más de 5 min — revisar el barrido`,
      };
    }
    return {
      status: "OK",
      timestamp: now(),
      latencyMs,
      message: stuckCount > 0 ? `${stuckCount} reservas vencidas pendientes de recuperar (normal, transitorio)` : "Sin reservas atascadas",
    };
  } catch {
    return {
      status: "ERROR",
      timestamp: now(),
      latencyMs: Date.now() - startedAt,
      message: "No se pudo consultar el estado del inventario",
    };
  }
}

/* ────────────────────────── payments (config, no ping en vivo) ────────────────────────── */

function checkPayments(): HealthCheck {
  const wompiVars = ["WOMPI_PUBLIC_KEY", "WOMPI_PRIVATE_KEY", "WOMPI_INTEGRITY_SECRET", "WOMPI_EVENTS_SECRET"];
  const paypalVars = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"];

  const missingWompi = wompiVars.filter((v) => !process.env[v]);
  const missingPaypal = paypalVars.filter((v) => !process.env[v]);

  if (missingWompi.length === 0 && missingPaypal.length === 0) {
    return {
      status: "OK",
      timestamp: now(),
      message: "Credenciales de Wompi y PayPal configuradas (no se hace ping en vivo al proveedor — no implementado)",
    };
  }

  const missing = [
    ...(missingWompi.length > 0 ? [`Wompi: ${missingWompi.join(", ")}`] : []),
    ...(missingPaypal.length > 0 ? [`PayPal: ${missingPaypal.join(", ")}`] : []),
  ].join(" · ");

  return {
    status: "NOT_CONFIGURED",
    timestamp: now(),
    message: `Faltan credenciales — ${missing}`,
  };
}

/* ────────────────────────── webhooks ────────────────────────── */

interface WebhookStatsRow {
  last_received_at: string | null;
  recent_total: string;
  recent_errors: string;
}

async function checkWebhooks(pool: Pool): Promise<HealthCheck> {
  const startedAt = Date.now();
  try {
    const { rows } = (await withTimeout(
      pool.query(`
        WITH recent AS (
          SELECT status FROM payment_events ORDER BY received_at DESC LIMIT 50
        )
        SELECT
          (SELECT max(received_at) FROM payment_events)::text AS last_received_at,
          (SELECT count(*) FROM recent) AS recent_total,
          (SELECT count(*) FROM recent WHERE status IN ('REJECTED', 'ERROR')) AS recent_errors
      `),
      HEALTH_QUERY_TIMEOUT_MS,
    )) as { rows: WebhookStatsRow[] };

    const row = rows[0];
    const latencyMs = Date.now() - startedAt;
    const total = Number(row.recent_total);

    if (total === 0) {
      return { status: "OK", timestamp: now(), latencyMs, message: "Sin webhooks recibidos todavía" };
    }

    const errors = Number(row.recent_errors);
    const errorRate = errors / total;

    if (errorRate > 0.5) {
      return {
        status: "ERROR",
        timestamp: now(),
        latencyMs,
        message: `${errors}/${total} de los últimos webhooks fallaron (rechazados o con error)`,
      };
    }
    if (errorRate > 0.2) {
      return {
        status: "WARNING",
        timestamp: now(),
        latencyMs,
        message: `${errors}/${total} de los últimos webhooks fallaron`,
      };
    }
    return {
      status: "OK",
      timestamp: now(),
      latencyMs,
      message: `Último webhook recibido: ${row.last_received_at ?? "sin dato"}`,
    };
  } catch {
    return {
      status: "ERROR",
      timestamp: now(),
      latencyMs: Date.now() - startedAt,
      message: "No se pudo consultar el estado de los webhooks",
    };
  }
}

/* ────────────────────────── refund worker ────────────────────────── */

interface RefundWorkerStatsRow {
  pending: string;
  stuck_initiated: string;
  manual_review: string;
  last_activity: string | null;
}

/** El worker retoma un `REFUND_INITIATED` viejo pasados 5 min (ver refund-service.ts) — el mismo umbral acá. */
const REFUND_WORKER_STUCK_MINUTES = 5;

async function checkRefundWorker(pool: Pool): Promise<HealthCheck> {
  const startedAt = Date.now();
  try {
    const { rows } = (await withTimeout(
      pool.query(
        `SELECT
           count(*) FILTER (WHERE status = 'PENDING_REFUND') AS pending,
           count(*) FILTER (WHERE status = 'REFUND_INITIATED' AND initiated_at < now() - interval '${REFUND_WORKER_STUCK_MINUTES} minutes') AS stuck_initiated,
           count(*) FILTER (WHERE status = 'MANUAL_REVIEW_REQUIRED') AS manual_review,
           (SELECT max(coalesce(completed_at, initiated_at)) FROM refund_requests)::text AS last_activity
         FROM refund_requests`,
      ),
      HEALTH_QUERY_TIMEOUT_MS,
    )) as { rows: RefundWorkerStatsRow[] };

    const row = rows[0];
    const latencyMs = Date.now() - startedAt;
    const stuckInitiated = Number(row.stuck_initiated);
    const manualReview = Number(row.manual_review);
    const pending = Number(row.pending);

    if (stuckInitiated > 0) {
      return {
        status: "ERROR",
        timestamp: now(),
        latencyMs,
        message: `${stuckInitiated} refund(s) en REFUND_INITIATED hace más de ${REFUND_WORKER_STUCK_MINUTES} min sin reintento — el worker puede no estar corriendo`,
      };
    }
    if (manualReview > 0) {
      return {
        status: "WARNING",
        timestamp: now(),
        latencyMs,
        message: `${manualReview} refund(s) esperando revisión manual de un admin`,
      };
    }
    return {
      status: "OK",
      timestamp: now(),
      latencyMs,
      message: pending > 0 ? `${pending} refund(s) en cola, dentro de lo esperado` : "Sin refunds pendientes",
    };
  } catch {
    return {
      status: "ERROR",
      timestamp: now(),
      latencyMs: Date.now() - startedAt,
      message: "No se pudo consultar el estado del worker de refunds",
    };
  }
}

/* ────────────────────────── conciliación de pagos (fase 8) ────────────────────────── */

interface StalePaymentIntentsRow {
  stuck: string;
  oldest_stuck_at: string | null;
}

/**
 * `payment_intents` en `INITIATED` hace más de `RECONCILE_STALE_MINUTES` —
 * exactamente lo que `db:reconcile-payments` (`reconciliation-service.ts`)
 * debería estar barriendo. Si este número crece y no baja solo, el worker
 * dejó de correr — mismo criterio que `checkRefundWorker` de acá abajo.
 */
async function checkPaymentReconciliation(pool: Pool): Promise<HealthCheck> {
  const startedAt = Date.now();
  try {
    const { rows } = (await withTimeout(
      pool.query(
        `SELECT
           count(*) AS stuck,
           min(updated_at)::text AS oldest_stuck_at
         FROM payment_intents
        WHERE status = 'INITIATED' AND updated_at < now() - interval '${RECONCILE_STALE_MINUTES} minutes'`,
      ),
      HEALTH_QUERY_TIMEOUT_MS,
    )) as { rows: StalePaymentIntentsRow[] };

    const row = rows[0];
    const latencyMs = Date.now() - startedAt;
    const stuck = Number(row.stuck);

    if (stuck > 0) {
      return {
        status: "WARNING",
        timestamp: now(),
        latencyMs,
        message: `${stuck} payment_intent(s) en INITIATED sin resolver hace más de ${RECONCILE_STALE_MINUTES} min (el más viejo desde ${row.oldest_stuck_at}) — el worker de conciliación puede no estar corriendo`,
      };
    }
    return { status: "OK", timestamp: now(), latencyMs, message: "Sin intents de pago atascados" };
  } catch {
    return {
      status: "ERROR",
      timestamp: now(),
      latencyMs: Date.now() - startedAt,
      message: "No se pudo consultar el estado de la conciliación de pagos",
    };
  }
}

/* ────────────────────────── reporte completo ────────────────────────── */

export async function getHealthReport(pool: Pool): Promise<HealthReport> {
  const [database, inventory, webhooks, refundWorker, paymentReconciliation] = await Promise.all([
    checkDatabase(pool),
    checkInventory(pool),
    checkWebhooks(pool),
    checkRefundWorker(pool),
    checkPaymentReconciliation(pool),
  ]);

  return {
    database,
    inventory,
    payments: checkPayments(),
    webhooks,
    refundWorker,
    paymentReconciliation,
  };
}

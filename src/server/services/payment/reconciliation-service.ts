import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { withTransaction } from "../../db/client";
import { syncPaymentIntentWithProvider } from "./webhook-service";

/**
 * Conciliación PROACTIVA. `syncPaymentIntentWithProvider` (Caso C) ya
 * existía desde fase 5, pero solo corría REACTIVAMENTE — cuando el propio
 * cliente volvía a `/checkout/resultado/[id]` (`result-service.ts`). Si
 * cierra la pestaña después de pagar y nunca vuelve, y el webhook también
 * se perdió, el pedido se quedaba en `PENDING` para siempre — nadie volvía
 * a preguntarle a Wompi/PayPal qué pasó.
 *
 * Este worker es el que barre eso de forma proactiva, mismo patrón que
 * `refund-service.ts`: `FOR UPDATE SKIP LOCKED` para poder correr varias
 * instancias a la vez sin pisarse, y reutiliza `updated_at` como marca de
 * "último intento" — igual que `refund_requests.initiated_at` hace de
 * "primera vez" y "cooldown de reintento" a la vez. No hay conflicto con
 * el uso que le da `result-service.ts` a esa misma columna (chequea "hace
 * más de 60s que no cambia" para decidir si sincroniza al vuelo): entre
 * una pasada de este worker y la siguiente hay minutos de por medio, de
 * sobra para que ese chequeo siga disparando bien si el cliente vuelve
 * antes.
 *
 * Nunca reimplementa la lógica de "qué significa aprobado/rechazado" —
 * eso sigue siendo únicamente `applyApprovedPayment`/`applyFailedPayment`
 * vía `syncPaymentIntentWithProvider`, el mismo camino que toma un webhook
 * real o la sincronización manual.
 */

export const RECONCILE_STALE_MINUTES = 5;

interface StaleIntentRow {
  id: string;
  provider: "WOMPI" | "PAYPAL";
}

/**
 * Toma UN `payment_intent` listo para reconciliar, o `null` si no hay
 * ninguno. Igual que `claimNextRefundRequest`: el lock de fila dura lo
 * mínimo — se suelta antes de llamar a ningún proveedor.
 */
export async function claimNextStaleIntent(pool: Pool): Promise<StaleIntentRow | null> {
  return withTransaction(pool, async (tx) => {
    const { rows: candidates } = (await tx.execute(sql`
      SELECT id, provider FROM payment_intents
       WHERE status = 'INITIATED'
         AND updated_at < now() - make_interval(secs => ${RECONCILE_STALE_MINUTES * 60}::double precision)
       ORDER BY updated_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
    `)) as unknown as { rows: StaleIntentRow[] };

    const candidate = candidates[0];
    if (!candidate) return null;

    // Marca "último intento" — evita que la próxima corrida (si arranca
    // antes de los RECONCILE_STALE_MINUTES) vuelva a tomar el mismo intent
    // mientras esta llamada al proveedor todavía está en curso o recién
    // terminó sin cambiar nada.
    await tx.execute(sql`UPDATE payment_intents SET updated_at = now() WHERE id = ${candidate.id}::uuid`);

    return candidate;
  });
}

export interface ReconciliationBatchResult {
  checked: number;
  synced: number;
  errors: number;
}

/**
 * Un lote del worker: revisa hasta `maxItems` intents atascados y corta en
 * cuanto no queda ninguno. Pensado para correr cada pocos minutos
 * (cron/scheduler externo) — `npm run db:reconcile-payments` es el punto
 * de entrada, igual que `npm run db:refund-worker`.
 *
 * Un error consultando a un proveedor puntual no aborta el lote entero —
 * ese intent simplemente vuelve a quedar disponible para el próximo
 * intento (no se re-lanza acá, se loguea y se sigue con el resto).
 */
export async function runReconciliationBatch(pool: Pool, maxItems = 20): Promise<ReconciliationBatchResult> {
  let checked = 0;
  let synced = 0;
  let errors = 0;

  for (let i = 0; i < maxItems; i += 1) {
    const claimed = await claimNextStaleIntent(pool);
    if (!claimed) break;

    checked += 1;
    try {
      const result = await syncPaymentIntentWithProvider(pool, claimed.id);
      if (result.synced) synced += 1;
    } catch (error) {
      errors += 1;
      console.error(`[reconciliation] error sincronizando payment_intent ${claimed.id} (${claimed.provider}):`, error);
    }
  }

  return { checked, synced, errors };
}

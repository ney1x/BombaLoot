import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { createDb, type Db } from "../db/client";

/**
 * Rate limiter de ventana FIJA, respaldado en `rate_limit_counters`
 * (Postgres) — no en memoria del proceso.
 *
 * Reemplaza la versión anterior, que vivía en un `Map` del proceso Node:
 * servía tal cual contra un contenedor único persistente, pero en Vercel
 * serverless cada invocación puede caer en un proceso nuevo, así que no
 * limitaba nada real entre requests — la limitación quedó documentada acá
 * mismo durante meses sin resolverse. Esta versión usa la base que ya
 * existe (Neon) en vez de sumar infraestructura nueva (Redis/Upstash).
 *
 * Ventana fija, no deslizante: un solo `INSERT ... ON CONFLICT DO UPDATE
 * ... RETURNING count` es atómico bajo concurrencia real gracias al lock de
 * fila de Postgres durante el upsert — sin abrir una transacción explícita
 * ni reintroducir el patrón "leer, decidir, escribir" que sí sería una
 * carrera. El costo de esa atomicidad barata es la ventana fija: un cliente
 * puede, en el peor caso, hacer hasta 2× `max` intentos repartidos justo
 * alrededor del borde entre dos ventanas. Para lo que este limitador
 * protege (fuerza bruta de login, spam de registro/checkout/tickets) esa
 * imprecisión es aceptable — no es un contador de facturación.
 */

export class RateLimitExceededError extends Error {
  readonly code = "RATE_LIMIT_EXCEEDED";

  constructor(
    readonly key: string,
    readonly limit: number,
    readonly windowSeconds: number,
  ) {
    super(`Rate limit excedido para "${key}": ${limit} intentos por ${windowSeconds}s`);
    this.name = "RateLimitExceededError";
  }
}

function windowStart(windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(Date.now() / windowMs) * windowMs);
}

/**
 * Registra un intento bajo `key` y lanza `RateLimitExceededError` si supera
 * `max` intentos dentro de la ventana actual. No lanza: el intento queda
 * registrado igual. `db` acepta tanto una conexión suelta (`createDb(pool)`,
 * el caso común) como una transacción ya abierta (`TxDb` — ver
 * `createReservation`, que lo llama dentro de su propia transacción para
 * que el intento cuente aunque el resto de la operación haga rollback).
 */
export async function checkRateLimit(db: Db, key: string, max: number, windowSeconds: number): Promise<void> {
  const start = windowStart(windowSeconds);

  const { rows } = (await db.execute(sql`
    INSERT INTO rate_limit_counters (key, window_start, count)
    VALUES (${key}, ${start.toISOString()}::timestamptz, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_counters.count + 1
    RETURNING count
  `)) as unknown as { rows: { count: number }[] };

  if (rows[0]!.count > max) {
    throw new RateLimitExceededError(key, max, windowSeconds);
  }
}

/** Solo para tests: vacía todos los contadores entre casos. Toma el `Pool` directo (no `Db`) para no obligar a cada test a envolverlo con `createDb` solo para esto. */
export async function resetRateLimits(pool: Pool): Promise<void> {
  await createDb(pool).execute(sql`DELETE FROM rate_limit_counters`);
}

/**
 * Ventanas vencidas no se borran solas (a diferencia del `Map` viejo, que
 * las perdía gratis al filtrar por timestamp en cada lectura) — sin esto la
 * tabla crece sin límite. Se llama desde el mismo cron que ya barre
 * reservas y pedidos vencidos (`scripts/db.ts sweep`).
 */
export async function sweepExpiredRateLimits(db: Db, olderThanSeconds = 60 * 60 * 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  const result = (await db.execute(
    sql`DELETE FROM rate_limit_counters WHERE window_start < ${cutoff.toISOString()}::timestamptz`,
  )) as unknown as { rowCount: number | null };
  return result.rowCount ?? 0;
}

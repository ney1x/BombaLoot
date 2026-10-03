import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

/**
 * `TxDb` — el mismo `Db` de Drizzle, pero marcado con un símbolo único que
 * nunca se exporta. Solo `beginTransaction`/`withTransaction` pueden producir
 * un valor de este tipo (vía `as TxDb` interno), así que en cualquier otro
 * archivo `TxDb` es un tipo nominal sin forma de fabricarlo.
 *
 * Esto existe por el hallazgo C1 de la auditoría: `claimCodesForProduct`
 * aceptaba `Db` genérico, que es el mismo tipo que devuelve `getDb()` (el pool
 * en autocommit). Nada impedía llamar `createReservation(getDb(), …)`, y si
 * esa reserva reclamaba solo parte de los códigos pedidos y lanzaba
 * `InsufficientStockError`, los códigos ya tomados quedaban comiteados —
 * sin nadie que hiciera ROLLBACK. Con `TxDb`, pasar `getDb()` donde se pide
 * `TxDb` es un error de compilación, no una convención en un comentario.
 */
declare const TRANSACTION_BRAND: unique symbol;
export type TxDb = Db & { readonly [TRANSACTION_BRAND]: true };

/**
 * Driver: `pg` sobre TCP. Funciona igual contra el Postgres local de
 * docker-compose y contra Neon a través de su pooler. Si más adelante alguna
 * ruta necesita correr en el runtime edge, se cambia el driver por
 * `@neondatabase/serverless` sin tocar el esquema ni las consultas.
 */
export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: Number(process.env.PGPOOL_MAX ?? 20),
    idleTimeoutMillis: 30_000,
    // M4: sin esto, un `FOR UPDATE` que nunca hace commit/rollback (crash a
    // mitad de handler, cliente que se cuelga) deja la fila bloqueada
    // indefinidamente y tapa el checkout para todos.
    statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 15_000),
    idle_in_transaction_session_timeout: Number(
      process.env.PG_IDLE_IN_TRANSACTION_TIMEOUT_MS ?? 10_000,
    ),
    ssl: isLocalDatabase(connectionString) ? undefined : { rejectUnauthorized: true },
  });
}

/**
 * M1: antes esto era `connectionString.includes("localhost")` — un substring
 * que un host de producción como `db.localhost.mi-proxy.com`, o una password
 * que contuviera la palabra "localhost", desactivaría el SSL sin que nadie lo
 * notara. Se parsea la URL y se compara el hostname exacto.
 */
export function isLocalDatabase(connectionString: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(connectionString).hostname;
  } catch {
    return false;
  }
  // `new URL(...).hostname` conserva los corchetes de una IPv6 literal
  // ("[::1]"), a diferencia de `.host`/`.hostname` de otras APIs — de ahí el
  // chequeo explícito con y sin corchetes.
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

let pool: Pool | undefined;
let db: Db | undefined;

function ensurePool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta DATABASE_URL");
    pool = createPool(url);
  }
  return pool;
}

export function getDb(): Db {
  if (!db) {
    db = drizzle(ensurePool(), { schema });
  }
  return db;
}

/**
 * El pool crudo, para servicios que necesitan abrir sus propias
 * transacciones (`withTransaction`/`beginTransaction`) — los Route Handlers
 * de auth y checkout lo usan así en vez de `getDb()`, que solo sirve para
 * ejecutar en autocommit.
 */
export function getPool(): Pool {
  return ensurePool();
}

export function createDb(pool: Pool): Db {
  return drizzle(pool, { schema });
}

/**
 * Transacción con control explícito del commit.
 *
 * `drizzle.transaction()` no sirve para el caso que más importa probar: la
 * prueba de concurrencia necesita abrir N transacciones, dejarlas todas
 * abiertas mientras compiten por la misma fila, y recién después confirmarlas.
 * Este handle da ese control sin meter ganchos de test en el código de
 * producción — `withTransaction` de abajo lo usa igual.
 */
export interface TransactionHandle {
  db: TxDb;
  client: PoolClient;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  release: () => void;
}

export async function beginTransaction(pool: Pool): Promise<TransactionHandle> {
  const client = await pool.connect();
  try {
    // M3: READ COMMITTED explícito, no el default del servidor. El reclamo
    // de códigos depende de `FOR UPDATE SKIP LOCKED` bajo READ COMMITTED
    // (lee el estado ya confirmado por la fila liberada); bajo SERIALIZABLE
    // o REPEATABLE READ, SKIP LOCKED sigue funcionando pero el resto de la
    // transacción empezaría a fallar por serialización bajo la contención
    // que justamente nos importa probar. Si Neon cambia su default alguna
    // vez, esto no cambia con él.
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
  } catch (error) {
    // M8: si BEGIN falla, la conexión nunca llega al try/finally del
    // llamador — hay que liberarla acá o se pierde del pool para siempre.
    client.release();
    throw error;
  }

  let settled = false;

  return {
    db: drizzle(client, { schema }) as unknown as TxDb,
    client,
    async commit() {
      if (settled) return;
      settled = true;
      await client.query("COMMIT");
    },
    async rollback() {
      if (settled) return;
      settled = true;
      try {
        await client.query("ROLLBACK");
      } catch {
        // La conexión puede haber quedado en estado abortado por un error
        // previo; ROLLBACK sobre un client ya roto no debe tapar el error
        // original que disparó el rollback.
      }
    },
    release() {
      client.release();
    },
  };
}

export async function withTransaction<T>(
  pool: Pool,
  fn: (tx: TxDb) => Promise<T>,
): Promise<T> {
  const handle = await beginTransaction(pool);
  try {
    const result = await fn(handle.db);
    await handle.commit();
    return result;
  } catch (error) {
    await handle.rollback();
    throw error;
  } finally {
    handle.release();
  }
}

export { schema };

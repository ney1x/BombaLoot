import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { Pool } from "pg";
import { runMigrations } from "@/server/db/migrate";
import { beginTransaction } from "@/server/db/client";
import { encryptCode } from "@/server/crypto/codes";
import { createOpaqueToken, generateOrderNumber } from "@/server/auth/tokens";
import { attachCodesToOrderItem } from "@/server/services/inventory";

config({ path: ".env.local" });

/**
 * Claves de prueba. Deterministas y sin valor: los códigos sembrados en tests
 * son basura generada al vuelo.
 */
process.env.CODE_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.CODE_FINGERPRINT_KEY ??= Buffer.alloc(32, 11).toString("base64");

export const TEST_GAME_ID = "valorant";
export const TEST_PRODUCT_ID = "valorant-565";

/**
 * Crea (recreándola) la base de datos de pruebas y aplica las migraciones.
 *
 * Guarda de seguridad: se niega a soltar una base cuyo nombre no diga "test".
 * Un `TEST_DATABASE_URL` mal copiado no puede borrar desarrollo ni producción.
 */
export async function createTestDatabase(): Promise<Pool> {
  const rawUrl = process.env.TEST_DATABASE_URL;
  if (!rawUrl) {
    throw new Error(
      "Falta TEST_DATABASE_URL. Copiá .env.example a .env.local (ver docker-compose.yml).",
    );
  }

  const url = new URL(rawUrl);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));

  if (!/^[A-Za-z0-9_]+$/.test(dbName) || !dbName.toLowerCase().includes("test")) {
    throw new Error(
      `Me niego a recrear "${dbName}": el nombre de la base de pruebas debe contener "test".`,
    );
  }

  const adminUrl = new URL(rawUrl);
  adminUrl.pathname = "/postgres";
  const admin = new Pool({ connectionString: adminUrl.toString() });

  try {
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: rawUrl, max: 25 });
  await runMigrations(pool);
  return pool;
}

/** Vacía todo lo transaccional entre tests, dejando el esquema intacto. */
export async function resetData(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE codes, code_batches, order_items, orders, reservations,
             order_discounts, payment_intents, payment_events, refund_requests,
             users, sessions
    RESTART IDENTITY CASCADE
  `);
  // audit_logs tiene trigger append-only: no se trunca desde la app.
}

export interface SeedProductOptions {
  productId?: string;
  gameId?: string;
  codeCount: number;
  priceCop?: number;
  maxPerOrder?: number;
}

/** Deja un producto con exactamente `codeCount` códigos AVAILABLE. */
export async function seedProduct(
  pool: Pool,
  options: SeedProductOptions,
): Promise<{ productId: string; codeIds: string[] }> {
  const {
    productId = TEST_PRODUCT_ID,
    gameId = TEST_GAME_ID,
    codeCount,
    priceCop = 28_400,
    maxPerOrder = 10,
  } = options;

  await pool.query(
    `INSERT INTO games (id, label, short_label, color_deep, color_base, color_tint)
     VALUES ($1, 'Valorant', 'Valorant', '#5C1420', '#9B2438', '#C85368')
     ON CONFLICT (id) DO NOTHING`,
    [gameId],
  );

  await pool.query(
    `INSERT INTO products (id, game_id, denomination, unit, price_cop, max_per_order)
     VALUES ($1, $2, $3, 'VP', $4, $5)
     ON CONFLICT (id) DO UPDATE
        SET max_per_order = EXCLUDED.max_per_order,
            price_cop = EXCLUDED.price_cop,
            is_active = true`,
    [productId, gameId, productId, priceCop, maxPerOrder],
  );

  const codeIds: string[] = [];
  for (let i = 0; i < codeCount; i += 1) {
    const encrypted = encryptCode(`TST-${randomBytes(6).toString("hex").toUpperCase()}`);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO codes (product_id, secret_cipher, secret_nonce, secret_tag, secret_fingerprint)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [productId, encrypted.cipher, encrypted.nonce, encrypted.tag, encrypted.fingerprint],
    );
    codeIds.push(rows[0].id);
  }

  return { productId, codeIds };
}

/**
 * Convierte una reserva en pedido, en una sola transacción, igual que hará el
 * checkout de servidor: se crean `orders` y `order_items`, se mueven los
 * códigos al puntero permanente y recién ahí se confirma. El CONSTRAINT TRIGGER
 * diferido valida en el COMMIT que la cantidad declarada y los códigos
 * asignados coincidan.
 *
 * `attachQuantity` permite asignar a propósito menos códigos de los declarados
 * para comprobar que el trigger rechaza el pedido.
 */
export async function createOrderFromReservation(
  pool: Pool,
  params: {
    reservationId: string;
    productId: string;
    quantity: number;
    attachQuantity?: number;
    unitPriceCop?: number;
  },
): Promise<{ orderId: string; orderItemId: string; codeIds: string[] }> {
  const {
    reservationId,
    productId,
    quantity,
    attachQuantity = quantity,
    unitPriceCop = 28_400,
  } = params;
  const subtotal = unitPriceCop * quantity;
  const token = createOpaqueToken();

  const handle = await beginTransaction(pool);
  try {
    const order = await handle.client.query<{ id: string }>(
      `INSERT INTO orders (order_number, access_token_hash, email, subtotal_cop, discount_cop, total_cop, payment_expires_at)
       VALUES ($1,$2,'comprador@test.local',$3,0,$3, now() + interval '30 minutes')
       RETURNING id`,
      [generateOrderNumber(), token.hash, subtotal],
    );

    const item = await handle.client.query<{ id: string }>(
      `INSERT INTO order_items
         (order_id, product_id, game_label, denomination, unit, quantity, unit_price_cop, line_total_cop)
       VALUES ($1,$2,'Valorant','565','VP',$3,$4,$5) RETURNING id`,
      [order.rows[0].id, productId, quantity, unitPriceCop, subtotal],
    );

    const codeIds =
      attachQuantity > 0
        ? await attachCodesToOrderItem(handle.db, {
            reservationId,
            productId,
            orderItemId: item.rows[0].id,
            quantity: attachQuantity,
          })
        : [];

    await handle.client.query(
      `UPDATE reservations SET status = 'CONSUMED', consumed_at = now(), order_id = $2
        WHERE id = $1::uuid`,
      [reservationId, order.rows[0].id],
    );

    await handle.commit();
    return { orderId: order.rows[0].id, orderItemId: item.rows[0].id, codeIds };
  } catch (error) {
    await handle.rollback();
    throw error;
  } finally {
    handle.release();
  }
}

/** Empuja `reserved_until` al pasado para simular una reserva vencida. */
export async function expireCodes(pool: Pool, codeIds: string[]): Promise<void> {
  await pool.query(
    `UPDATE codes SET reserved_until = now() - interval '1 second' WHERE id = ANY($1::uuid[])`,
    [codeIds],
  );
  await pool.query(
    `UPDATE reservations SET expires_at = now() - interval '1 second'
      WHERE id IN (SELECT reservation_id FROM codes WHERE id = ANY($1::uuid[]))`,
    [codeIds],
  );
}

export async function countByStatus(pool: Pool, productId: string): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ status: string; count: string }>(
    "SELECT status::text AS status, count(*) AS count FROM codes WHERE product_id = $1 GROUP BY status",
    [productId],
  );
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
}

/**
 * `createTestDatabase` solo corre migraciones, no el seed real (ese siembra
 * códigos también, que la mayoría de los tests arman a mano con
 * `seedProduct`) — los tests que necesitan niveles de fidelización reales
 * (fase 4, checkout) llaman esto explícitamente. Mismos valores que
 * `src/lib/user.ts`, para que un test que compara contra ese archivo no
 * dependa de mantenerlos sincronizados a mano en dos lugares más de lo
 * necesario.
 */
export async function seedLoyaltyTiers(pool: Pool): Promise<void> {
  const tiers = [
    { id: "bronze", name: "Bronze", minPurchases: 0, discountPct: 0 },
    { id: "silver", name: "Silver", minPurchases: 5, discountPct: 3 },
    { id: "gold", name: "Gold", minPurchases: 10, discountPct: 5 },
    { id: "vip", name: "VIP", minPurchases: 20, discountPct: 8 },
  ];

  for (const [index, tier] of tiers.entries()) {
    await pool.query(
      `INSERT INTO loyalty_tiers (id, name, min_purchases, discount_pct, sort_order)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name, min_purchases = EXCLUDED.min_purchases,
              discount_pct = EXCLUDED.discount_pct`,
      [tier.id, tier.name, tier.minPurchases, tier.discountPct, index],
    );
  }
}

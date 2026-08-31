import "server-only";

import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { GAMES, GAME_COLORS, PRODUCTS, type Product } from "../../lib/products";
import { LOYALTY_TIERS } from "../../lib/user";
import { encryptCode } from "../crypto/codes";

/**
 * Semilla del catálogo.
 *
 * Los juegos, productos y niveles salen de los mismos arreglos que hoy usa el
 * frontend aprobado, así que la tienda con base de datos muestra exactamente el
 * mismo catálogo que la versión mock. Cuando la fase 4 corte el frontend de
 * `src/lib`, estos arreglos se mudan acá y dejan de viajar al navegador.
 */

const CODE_PREFIX: Record<string, string> = {
  valorant: "VLR",
  roblox: "RBX",
  league: "LOL",
  overwatch: "OW",
};

/** Cuántos códigos sembrar para reproducir el estado de stock del mock. */
function codeCountFor(product: Product): number {
  if (product.stock === "out") return 0;
  if (product.stock === "low") return Math.max(1, product.lowStockCount ?? 3);
  return 25;
}

function generatePlainCode(gameId: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const block = (start: number) =>
    Array.from({ length: 4 }, (_, i) => alphabet[bytes[start + i] % alphabet.length]).join("");
  return `${CODE_PREFIX[gameId] ?? "GEN"}-${block(0)}-${block(4)}`;
}

export interface SeedResult {
  games: number;
  products: number;
  tiers: number;
  codes: number;
}

export async function seed(pool: Pool): Promise<SeedResult> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const [index, game] of GAMES.entries()) {
      const colors = GAME_COLORS[game.id];
      const short = PRODUCTS.find((p) => p.gameId === game.id)?.gameShortLabel ?? game.label;
      await client.query(
        `INSERT INTO games (id, label, short_label, color_deep, color_base, color_tint, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE
            SET label = EXCLUDED.label, short_label = EXCLUDED.short_label,
                color_deep = EXCLUDED.color_deep, color_base = EXCLUDED.color_base,
                color_tint = EXCLUDED.color_tint, sort_order = EXCLUDED.sort_order`,
        [game.id, game.label, short, colors.deep, colors.base, colors.tint, index],
      );
    }

    for (const product of PRODUCTS) {
      await client.query(
        `INSERT INTO products (id, game_id, denomination, unit, price_cop, low_stock_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE
            SET price_cop = EXCLUDED.price_cop, low_stock_at = EXCLUDED.low_stock_at`,
        [product.id, product.gameId, product.denomination, product.unit, product.priceCop, 5],
      );
    }

    for (const [index, tier] of LOYALTY_TIERS.entries()) {
      await client.query(
        `INSERT INTO loyalty_tiers (id, name, min_purchases, discount_pct, benefits, sort_order)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6)
         ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name, min_purchases = EXCLUDED.min_purchases,
                discount_pct = EXCLUDED.discount_pct, benefits = EXCLUDED.benefits`,
        [tier.id, tier.name, tier.minPurchases, tier.discountPct, JSON.stringify(tier.benefits), index],
      );
    }

    let codes = 0;
    for (const product of PRODUCTS) {
      const target = codeCountFor(product);

      const { rows } = await client.query<{ count: string }>(
        "SELECT count(*) AS count FROM codes WHERE product_id = $1",
        [product.id],
      );
      const existing = Number(rows[0].count);
      if (existing >= target) continue;

      const batch = await client.query<{ id: string }>(
        `INSERT INTO code_batches (product_id, source, note)
         VALUES ($1, 'seed', 'Lote de desarrollo generado por seed.ts')
         RETURNING id`,
        [product.id],
      );

      for (let i = existing; i < target; i += 1) {
        const encrypted = encryptCode(generatePlainCode(product.gameId));
        await client.query(
          `INSERT INTO codes (product_id, secret_cipher, secret_nonce, secret_tag, secret_fingerprint, batch_id)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (secret_fingerprint) DO NOTHING`,
          [
            product.id,
            encrypted.cipher,
            encrypted.nonce,
            encrypted.tag,
            encrypted.fingerprint,
            batch.rows[0].id,
          ],
        );
        codes += 1;
      }
    }

    await client.query("COMMIT");

    return {
      games: GAMES.length,
      products: PRODUCTS.length,
      tiers: LOYALTY_TIERS.length,
      codes,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

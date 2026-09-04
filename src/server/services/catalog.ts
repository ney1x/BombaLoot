import "server-only";

import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { getAvailability } from "./inventory";

/**
 * Catálogo real, contra Postgres. El frontend nunca decide precio,
 * disponibilidad, descuento ni si un producto es válido — todo sale de
 * acá, calculado en el momento de la lectura con el mismo predicado que
 * usa el reclamo de inventario (`getAvailability`).
 */
export interface CatalogProduct {
  id: string;
  gameId: string;
  gameLabel: string;
  gameShortLabel: string;
  denomination: string;
  unit: string;
  priceCop: number;
  maxPerOrder: number;
  lowStockAt: number;
  available: number;
  stock: "available" | "low" | "out";
  imageUrl: string | null;
  /** NULL = sin posición manual en el rotator de Home — ver `heroSortOrder` en schema.ts. */
  heroSortOrder: number | null;
}

function stockStateFor(available: number, lowStockAt: number): CatalogProduct["stock"] {
  if (available <= 0) return "out";
  if (available <= lowStockAt) return "low";
  return "available";
}

export async function listCatalogProducts(db: Db): Promise<CatalogProduct[]> {
  const { rows } = (await db.execute(sql`
    SELECT p.id, p.game_id, g.label AS game_label, g.short_label AS game_short_label,
           p.denomination, p.unit, p.price_cop, p.max_per_order, p.low_stock_at,
           p.hero_sort_order, pi.image_url
      FROM products p
      JOIN games g ON g.id = p.game_id
      LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary AND pi.is_active
     WHERE p.is_active AND g.is_active
     ORDER BY g.sort_order, p.price_cop
  `)) as unknown as {
    rows: Array<{
      id: string;
      game_id: string;
      game_label: string;
      game_short_label: string;
      denomination: string;
      unit: string;
      price_cop: number;
      max_per_order: number;
      low_stock_at: number;
      hero_sort_order: number | null;
      image_url: string | null;
    }>;
  };

  const availability = await getAvailability(
    db,
    rows.map((r) => r.id),
  );

  return rows.map((r) => {
    const available = availability.get(r.id) ?? 0;
    return {
      id: r.id,
      gameId: r.game_id,
      gameLabel: r.game_label,
      gameShortLabel: r.game_short_label,
      denomination: r.denomination,
      unit: r.unit,
      priceCop: Number(r.price_cop),
      maxPerOrder: r.max_per_order,
      lowStockAt: r.low_stock_at,
      available,
      stock: stockStateFor(available, r.low_stock_at),
      imageUrl: r.image_url,
      heroSortOrder: r.hero_sort_order,
    };
  });
}

export async function getCatalogProduct(db: Db, productId: string): Promise<CatalogProduct | null> {
  const all = await listCatalogProducts(db);
  return all.find((p) => p.id === productId) ?? null;
}

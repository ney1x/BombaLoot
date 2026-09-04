import type { GameId, Product } from "./products";

/**
 * Forma mínima que necesitamos del catálogo real (server-side vía
 * `listCatalogProducts`, o client-side vía el JSON de `/api/catalog`) para
 * mapearla al `Product` que ya consumen los componentes de storefront.
 */
export interface RawCatalogProduct {
  id: string;
  gameId: string;
  gameLabel: string;
  gameShortLabel: string;
  denomination: string;
  unit: string;
  priceCop: number;
  available: number;
  maxPerOrder: number;
  stock: "available" | "low" | "out";
  imageUrl: string | null;
  heroSortOrder: number | null;
}

export function toStoreProduct(p: RawCatalogProduct): Product {
  return {
    id: p.id,
    gameId: p.gameId as GameId,
    gameLabel: p.gameLabel,
    gameShortLabel: p.gameShortLabel,
    denomination: p.denomination,
    unit: p.unit,
    priceCop: p.priceCop,
    stock: p.stock,
    lowStockCount: p.stock === "low" ? p.available : undefined,
    imageUrl: p.imageUrl,
    available: p.available,
    maxPerOrder: p.maxPerOrder,
    heroSortOrder: p.heroSortOrder,
  };
}

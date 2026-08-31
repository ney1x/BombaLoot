export type GameId = "valorant" | "roblox" | "league" | "overwatch";

export type StockState = "available" | "low" | "out";

export interface Product {
  id: string;
  gameId: GameId;
  gameLabel: string;
  gameShortLabel: string;
  denomination: string;
  unit: string;
  priceCop: number;
  stock: StockState;
  lowStockCount?: number;
  imageUrl?: string | null;
  /** Stock real y tope por pedido — presentes siempre en datos reales del catálogo; ausentes solo en el mock legado de abajo. */
  available?: number;
  maxPerOrder?: number;
}

export const GAMES: { id: GameId; label: string }[] = [
  { id: "valorant", label: "Valorant" },
  { id: "roblox", label: "Roblox" },
  { id: "league", label: "League of Legends" },
  { id: "overwatch", label: "Overwatch" },
];

/**
 * Original, non-licensed per-game color identity — no official artwork or
 * marks. deep/base/tint drive panel backgrounds and pattern strokes.
 */
export const GAME_COLORS: Record<GameId, { deep: string; base: string; tint: string }> = {
  valorant: { deep: "#5C1420", base: "#9B2438", tint: "#C85368" },
  roblox: { deep: "#5C3115", base: "#A85A2A", tint: "#D0854E" },
  league: { deep: "#0F3E3B", base: "#1D6D68", tint: "#4A9994" },
  overwatch: { deep: "#16324A", base: "#2C5A83", tint: "#5A87AE" },
};

export const PRODUCTS: Product[] = [
  {
    id: "valorant-565",
    gameId: "valorant",
    gameLabel: "Valorant",
    gameShortLabel: "Valorant",
    denomination: "565",
    unit: "VP",
    priceCop: 28400,
    stock: "available",
  },
  {
    id: "roblox-840",
    gameId: "roblox",
    gameLabel: "Roblox",
    gameShortLabel: "Roblox",
    denomination: "840",
    unit: "Robux",
    priceCop: 32900,
    stock: "available",
  },
  {
    id: "roblox-1050",
    gameId: "roblox",
    gameLabel: "Roblox",
    gameShortLabel: "Roblox",
    denomination: "1050",
    unit: "Robux",
    priceCop: 41200,
    stock: "low",
    lowStockCount: 3,
  },
  {
    id: "league-575",
    gameId: "league",
    gameLabel: "League of Legends",
    gameShortLabel: "LoL",
    denomination: "575",
    unit: "RP",
    priceCop: 24900,
    stock: "available",
  },
  {
    id: "overwatch-500",
    gameId: "overwatch",
    gameLabel: "Overwatch",
    gameShortLabel: "Overwatch",
    denomination: "500",
    unit: "de saldo",
    priceCop: 22900,
    stock: "available",
  },
  {
    id: "overwatch-1000",
    gameId: "overwatch",
    gameLabel: "Overwatch",
    gameShortLabel: "Overwatch",
    denomination: "1000",
    unit: "de saldo",
    priceCop: 43900,
    stock: "out",
  },
];

/**
 * Tope real de unidades que se pueden agregar de un producto — stock
 * disponible y máximo por pedido, real de la base. `undefined` (mock
 * legado sin esos campos) cae a 10 como antes, nunca a "sin límite": el
 * bug real era que un producto sin `lowStockCount` (osea *no* "low", lo
 * cual incluye "out") caía siempre a ese 10 fijo — un producto agotado
 * podía seguir "agregándose" en el carrito aunque no quedara nada.
 */
export function maxAddableQuantity(product: Product): number {
  const available = product.available ?? 10;
  const maxPerOrder = product.maxPerOrder ?? 10;
  return Math.max(0, Math.min(available, maxPerOrder));
}

export function startingPrice(gameId: GameId): number {
  const prices = PRODUCTS.filter((p) => p.gameId === gameId).map((p) => p.priceCop);
  return Math.min(...prices);
}

export function formatCop(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

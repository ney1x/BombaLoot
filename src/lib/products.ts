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
  /** Posición manual en el rotator de Home — NULL/ausente = orden natural del catálogo. */
  heroSortOrder?: number | null;
}

export const GAMES: { id: GameId; label: string }[] = [
  { id: "valorant", label: "Valorant" },
  { id: "roblox", label: "Roblox" },
  { id: "league", label: "League of Legends" },
  { id: "overwatch", label: "Overwatch" },
];

/**
 * Copy de SEO por juego (`/catalogo/[game]`, `generateMetadata`) — términos
 * verificados contra `ProductCreateForm.tsx` (`UNIT_HINTS`), la tabla real
 * de denominación/unidad que usa el admin al cargar productos: VP para
 * Valorant, Robux para Roblox, RP para League of Legends, "de saldo" para
 * Overwatch (no tiene nombre de moneda propio, así que el título no inventa
 * uno — dice "Saldo", como en todo el resto del sitio).
 */
export const GAME_SEO: Record<GameId, { title: string; description: string }> = {
  valorant: {
    title: "Valorant Points (VP) | Compra VP en Colombia | BombaLoot",
    description:
      "Comprá Valorant Points (VP) en Colombia con entrega automática apenas se confirma el pago. Recargá tu cuenta de Valorant de forma segura.",
  },
  roblox: {
    title: "Robux | Compra Robux en Colombia | BombaLoot",
    description:
      "Comprá Robux en Colombia con entrega automática apenas se confirma el pago. Recargá tu cuenta de Roblox de forma segura.",
  },
  league: {
    title: "RP de League of Legends | Compra en Colombia | BombaLoot",
    description:
      "Comprá RP (Riot Points) para League of Legends en Colombia con entrega automática apenas se confirma el pago. Recargá tu cuenta de forma segura.",
  },
  overwatch: {
    title: "Saldo de Overwatch | Recarga en Colombia | BombaLoot",
    description:
      "Recargá saldo para Overwatch en Colombia con entrega automática apenas se confirma el pago. Pago seguro y código al instante.",
  },
};

/**
 * Original, non-licensed per-game color identity — no official artwork or
 * marks. deep/base/tint drive panel backgrounds and pattern strokes.
 */
export const GAME_COLORS: Record<GameId, { deep: string; base: string; tint: string }> = {
  valorant: { deep: "#5C1420", base: "#9B2438", tint: "#C85368" },
  roblox: { deep: "#1F4318", base: "#3E7D3A", tint: "#6FAE68" },
  league: { deep: "#4A330A", base: "#96690E", tint: "#C99A3A" },
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

/**
 * Orden del rotator de Home — separado del orden del catálogo (que sigue
 * siendo juego → precio, sin tocar). `heroSortOrder` NULL cae al final,
 * en el orden en que ya venían (estable): así un producto sin posición
 * manual asignada no salta a un lugar arbitrario cada vez que se recalcula.
 */
export function sortForHero<T extends { heroSortOrder?: number | null }>(products: T[]): T[] {
  return products
    .map((product, index) => ({ product, index }))
    .sort((a, b) => {
      const orderA = a.product.heroSortOrder ?? Infinity;
      const orderB = b.product.heroSortOrder ?? Infinity;
      return orderA - orderB || a.index - b.index;
    })
    .map(({ product }) => product);
}

export function formatCop(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Nombre legible de un producto puntual — "565 VP — Valorant", no solo
 * "Valorant" (Fase 9: cada denominación es su propia entidad indexable vía
 * `Product` schema, aunque comparta URL con las demás del mismo juego —
 * el alt de su imagen tiene que poder distinguirla igual). Mismo formato
 * que `name` en `toJsonLdProduct` (`lib/seo.ts`) a propósito, para que el
 * alt de la imagen y el nombre que lee Google en el schema sean la misma
 * entidad dicha dos veces, no dos etiquetas distintas para lo mismo.
 */
export function productImageLabel(product: { denomination: string; unit: string; gameLabel: string }): string {
  return `${product.denomination} ${product.unit} — ${product.gameLabel}`;
}

import type { GameId } from "./products";

export type PaymentStatus = "pending" | "paid" | "failed";
export type DeliveryStatus = "pending" | "delivered";
export type CodeStatus = "available" | "unavailable";

export interface OrderItem {
  productId: string;
  gameId: GameId;
  gameLabel: string;
  denomination: string;
  unit: string;
  quantity: number;
  unitPriceCop: number;
  code?: string;
  codeStatus?: CodeStatus;
}

export interface Order {
  id: string;
  date: string;
  email: string;
  items: OrderItem[];
  subtotalCop: number;
  discountCop: number;
  totalCop: number;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
}

function computeTotals(items: OrderItem[], discountPct = 0) {
  const subtotalCop = items.reduce((sum, i) => sum + i.unitPriceCop * i.quantity, 0);
  const discountCop = Math.round(subtotalCop * (discountPct / 100));
  return { subtotalCop, discountCop, totalCop: subtotalCop - discountCop };
}

const orderDelivered: OrderItem[] = [
  {
    productId: "valorant-565",
    gameId: "valorant",
    gameLabel: "Valorant",
    denomination: "565",
    unit: "VP",
    quantity: 1,
    unitPriceCop: 28400,
    code: "VLR-7F2K-9QRT",
    codeStatus: "available",
  },
];

const orderDeliveredIssue: OrderItem[] = [
  {
    productId: "roblox-840",
    gameId: "roblox",
    gameLabel: "Roblox",
    denomination: "840",
    unit: "Robux",
    quantity: 2,
    unitPriceCop: 32900,
    codeStatus: "unavailable",
  },
];

const orderPending: OrderItem[] = [
  {
    productId: "overwatch-500",
    gameId: "overwatch",
    gameLabel: "Overwatch",
    denomination: "500",
    unit: "de saldo",
    quantity: 1,
    unitPriceCop: 22900,
  },
];

const orderFailed: OrderItem[] = [
  {
    productId: "league-575",
    gameId: "league",
    gameLabel: "League of Legends",
    denomination: "575",
    unit: "RP",
    quantity: 1,
    unitPriceCop: 24900,
  },
];

export const MOCK_ORDERS: Order[] = [
  {
    id: "A7F3-2291",
    date: "2026-08-24",
    email: "ana.martinez@email.com",
    items: orderDelivered,
    paymentStatus: "paid",
    deliveryStatus: "delivered",
    ...computeTotals(orderDelivered, 3),
  },
  {
    id: "B19D-5537",
    date: "2026-08-19",
    email: "ana.martinez@email.com",
    items: orderDeliveredIssue,
    paymentStatus: "paid",
    deliveryStatus: "pending",
    ...computeTotals(orderDeliveredIssue, 3),
  },
  {
    id: "C402-8814",
    date: "2026-08-29",
    email: "ana.martinez@email.com",
    items: orderPending,
    paymentStatus: "pending",
    deliveryStatus: "pending",
    ...computeTotals(orderPending),
  },
  {
    id: "D861-1042",
    date: "2026-08-12",
    email: "ana.martinez@email.com",
    items: orderFailed,
    paymentStatus: "failed",
    deliveryStatus: "pending",
    ...computeTotals(orderFailed),
  },
];

export function getOrder(id: string): Order | undefined {
  return MOCK_ORDERS.find((o) => o.id === id);
}

export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; tone: "good" | "warn" | "bad" }> = {
  paid: { label: "Pago confirmado", tone: "good" },
  pending: { label: "Pago pendiente", tone: "warn" },
  failed: { label: "Pago rechazado", tone: "bad" },
};

export const DELIVERY_STATUS_META: Record<DeliveryStatus, { label: string; tone: "good" | "warn" | "neutral" }> = {
  delivered: { label: "Entregado", tone: "good" },
  pending: { label: "Por entregar", tone: "neutral" },
};

export function orderItemsSummary(order: Order): string {
  return order.items.map((i) => `${i.gameLabel} ${i.denomination} ${i.unit} ×${i.quantity}`).join(", ");
}

const CODE_PREFIX: Record<GameId, string> = {
  valorant: "VLR",
  roblox: "RBX",
  league: "LOL",
  overwatch: "OW",
};

/** Stand-in for the server-issued code once a real inventory API exists. */
export function generateMockCode(gameId: GameId): string {
  const block = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${CODE_PREFIX[gameId]}-${block()}-${block()}`;
}

const GUEST_ORDER_PREFIX = "loadout-order-";

/**
 * Orders created client-side right after a mock checkout completes. Stands
 * in for the eventual orders API — same `Order` shape, persisted locally so
 * the confirmation and delivery screens can be revisited within this browser.
 */
export function saveGuestOrder(order: Order) {
  try {
    localStorage.setItem(GUEST_ORDER_PREFIX + order.id, JSON.stringify(order));
  } catch {}
}

export function getGuestOrder(id: string): Order | undefined {
  try {
    const raw = localStorage.getItem(GUEST_ORDER_PREFIX + id);
    return raw ? (JSON.parse(raw) as Order) : undefined;
  } catch {
    return undefined;
  }
}

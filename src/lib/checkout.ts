import type { GameId } from "./products";

/**
 * Mock checkout state — no real payment/backend yet. Shapes mirror what the
 * eventual Wompi/PayPal adapter layer and reservation API will return, so
 * components read totals/status as data instead of hardcoded copy.
 */

export type PaymentMethodId = "wompi" | "paypal";

export interface PaymentMethodMeta {
  id: PaymentMethodId;
  name: string;
  region: string;
  sublabel: string;
  description: string;
}

export const PAYMENT_METHODS: PaymentMethodMeta[] = [
  {
    id: "wompi",
    name: "Wompi",
    region: "Colombia",
    sublabel: "Nequi · PSE · Tarjetas",
    description: "Pagá con tu método favorito, procesado en Colombia.",
  },
  {
    id: "paypal",
    name: "PayPal",
    region: "Internacional",
    sublabel: "Cuenta o tarjeta PayPal",
    description: "Ideal si estás comprando desde fuera de Colombia.",
  },
];

/** Reservation window while a code is held for this checkout session. */
export const RESERVATION_SECONDS = 600;

export interface BuyerInfo {
  name: string;
  email: string;
  isGuest: boolean;
}

export interface PendingCheckoutItem {
  productId: string;
  gameId: GameId;
  gameLabel: string;
  denomination: string;
  unit: string;
  quantity: number;
  unitPriceCop: number;
}

export interface PendingCheckout {
  id: string;
  createdAt: string;
  buyer: BuyerInfo;
  method: PaymentMethodId;
  items: PendingCheckoutItem[];
  subtotalCop: number;
  discountCop: number;
  totalCop: number;
}

const PENDING_KEY = "loadout-pending-checkout";

export function generateOrderId(): string {
  const part = () =>
    Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
  return `${part()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function savePendingCheckout(checkout: PendingCheckout) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(checkout));
  } catch {}
}

export function loadPendingCheckout(): PendingCheckout | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingCheckout) : null;
  } catch {
    return null;
  }
}

export function clearPendingCheckout() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {}
}

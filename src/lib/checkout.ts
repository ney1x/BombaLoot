import type { GameId } from "./products";
import type { PaymentProviderId } from "./payment-session";

/**
 * Mock checkout state — no real payment/backend yet. Shapes mirror what the
 * eventual Wompi/PayPal adapter layer and reservation API will return, so
 * components read totals/status as data instead of hardcoded copy.
 */

/**
 * Lo que el comprador ELIGE en el checkout — cuatro tarjetas con su propio
 * logo, no un solo botón "Wompi". `provider` es a quién se le pega
 * realmente al confirmar (`POST /api/payments/[provider]/init`): Nequi,
 * PSE y Tarjeta comparten el mismo checkout alojado de Wompi (ver
 * `wompi-client.ts` — es Wompi quien arma su propia pantalla de método),
 * así que las tres apuntan a `provider: "wompi"`. Separar "método visible"
 * de "proveedor real" es lo que permite mostrar los tres logos sin
 * necesitar tres rutas de backend distintas.
 */
export type PaymentMethodId = "nequi" | "pse" | "card" | "paypal";

export interface PaymentMethodMeta {
  id: PaymentMethodId;
  provider: PaymentProviderId;
  name: string;
  /**
   * "Colombia" = solo funciona con cuenta bancaria o Nequi colombiana
   * (Nequi, PSE — el dinero sale de un banco local, no hay forma de pagar
   * desde el exterior). "Internacional" = acepta tarjeta de cualquier país,
   * no solo Colombia — Wompi procesa Visa/Mastercard/Amex tanto locales
   * como emitidas en el exterior (confirmado contra la propia documentación
   * de soporte de Wompi, no es un supuesto). El dinero siempre liquida en
   * COP de cualquier forma; esto es sobre quién puede pagar, no sobre en
   * qué moneda cobra el comercio.
   */
  region: string;
  sublabel: string;
  description: string;
}

export const PAYMENT_METHODS: PaymentMethodMeta[] = [
  {
    id: "nequi",
    provider: "wompi",
    name: "Nequi",
    region: "Colombia",
    sublabel: "Pagá desde la app",
    description: "Confirmás el pago desde tu app de Nequi.",
  },
  {
    id: "pse",
    provider: "wompi",
    name: "PSE",
    region: "Colombia",
    sublabel: "Débito desde tu banco",
    description: "Pagá directo desde tu cuenta bancaria.",
  },
  {
    id: "card",
    provider: "wompi",
    name: "Tarjeta débito o crédito",
    region: "Internacional",
    sublabel: "Visa, Mastercard y más",
    description: "Pagá con tarjeta colombiana o del exterior — Wompi acepta ambas.",
  },
  {
    id: "paypal",
    provider: "paypal",
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

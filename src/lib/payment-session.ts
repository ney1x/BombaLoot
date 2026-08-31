/**
 * Puente entre `/checkout` (crea el pedido real) y `/checkout/pago` /
 * `/checkout/resultado/[paymentIntentId]` (inician el pago y muestran el
 * resultado). `sessionStorage` porque sobrevive el ida-y-vuelta a
 * Wompi/PayPal dentro de la misma pestaña, igual que `lib/checkout.ts`
 * para el flujo mock — este es el equivalente para el flujo real, sin
 * tocar aquel archivo.
 */

export type PaymentProviderId = "wompi" | "paypal";

export interface RealCheckoutSession {
  orderId: string;
  orderNumber: string;
  /** `null` en un reintento sin caché — ver el trade-off documentado en checkout-service.ts. */
  accessToken: string | null;
  email: string;
  totalCop: number;
  paymentExpiresAt: string;
  provider: PaymentProviderId;
}

const KEY = "loadout-real-checkout";

export function saveRealCheckoutSession(session: RealCheckoutSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {}
}

export function loadRealCheckoutSession(): RealCheckoutSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RealCheckoutSession) : null;
  } catch {
    return null;
  }
}

export function clearRealCheckoutSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}

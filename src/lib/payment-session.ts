/**
 * Puente entre `/checkout` (crea el pedido real) y `/checkout/pago` /
 * `/checkout/resultado/[paymentIntentId]` (inician el pago y muestran el
 * resultado). `sessionStorage` porque sobrevive el ida-y-vuelta a
 * Wompi/PayPal dentro de la misma pestaña, igual que `lib/checkout.ts`
 * para el flujo mock — este es el equivalente para el flujo real, sin
 * tocar aquel archivo.
 *
 * El `accessToken` del pedido de invitado deliberadamente NO vive acá
 * (auditoría de seguridad, 2026-09-04) — `sessionStorage` es legible por
 * cualquier JS de la página, así que guardar ahí un bearer token era una
 * superficie de exposición innecesaria (ante una XSS futura, por ejemplo).
 * Ese token ahora vive solo en una cookie httpOnly (`loadout_order_<id>`,
 * ver `server/auth/cookies.ts`), plantada por el propio servidor al crear
 * el pedido — nunca pasa por acá.
 */

export type PaymentProviderId = "wompi" | "paypal";

export interface RealCheckoutSession {
  orderId: string;
  orderNumber: string;
  email: string;
  totalCop: number;
  paymentExpiresAt: string;
  /** A quién se le pega de verdad (`POST /api/payments/[provider]/init`). */
  provider: PaymentProviderId;
  /** Qué tarjeta eligió el comprador en el picker (nequi/pse/card/paypal,
      ver lib/checkout.ts) — solo para mostrar el nombre/logo correcto en
      "Te llevamos a X" en /checkout/pago. No cambia a quién se le pega. */
  methodId?: string;
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

const REDIRECT_STARTED_KEY = "loadout-real-checkout-redirect-started";

/**
 * Se marca justo antes de `window.location.href = checkoutUrl` en
 * `/checkout/pago`. Aparte (no dentro) de `RealCheckoutSession`: esa sesión
 * la siguen leyendo `PaymentResultReal`/`OrderDeliveryReal` después de
 * volver del proveedor, así que no se puede borrar al salir. Esta marca es
 * la señal de "ya se inició el redirect para este pedido" — si el usuario
 * vuelve a `/checkout/pago` (atrás, bfcache, recarga) la encuentra puesta y
 * rebota a `/checkout` en vez de reintentar el pago o quedar mostrando el
 * spinner para siempre.
 */
export function markCheckoutRedirectStarted(orderId: string): void {
  try {
    sessionStorage.setItem(REDIRECT_STARTED_KEY, orderId);
  } catch {}
}

export function wasCheckoutRedirectStarted(orderId: string): boolean {
  try {
    return sessionStorage.getItem(REDIRECT_STARTED_KEY) === orderId;
  } catch {
    return false;
  }
}

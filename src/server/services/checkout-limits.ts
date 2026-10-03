import "server-only";

/** Límite de intentos de checkout, centralizado como el resto de `*-limits.ts`. */
export interface CheckoutLimits {
  maxPerWindow: number;
  windowSeconds: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const CHECKOUT_LIMITS: CheckoutLimits = {
  maxPerWindow: envInt("CHECKOUT_MAX_PER_WINDOW", 10),
  windowSeconds: envInt("CHECKOUT_WINDOW_SECONDS", 300),
};

/**
 * Preview de cupón (`/api/checkout/discount-preview`) — público, sin
 * sesión obligatoria, y a diferencia del resto de endpoints sensibles del
 * proyecto no tenía límite propio (hallazgo de auditoría de seguridad,
 * 2026-09-02): sin esto, es un oráculo para enumerar códigos de
 * distribución restringida a fuerza bruta. Ventana más generosa que
 * `CHECKOUT_LIMITS` porque tipear/corregir un cupón dispara varios
 * intentos legítimos en segundos.
 */
export const DISCOUNT_PREVIEW_LIMITS: CheckoutLimits = {
  maxPerWindow: envInt("DISCOUNT_PREVIEW_MAX_PER_WINDOW", 20),
  windowSeconds: envInt("DISCOUNT_PREVIEW_WINDOW_SECONDS", 300),
};

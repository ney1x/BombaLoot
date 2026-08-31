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

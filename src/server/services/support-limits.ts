import "server-only";

/**
 * Límites de abuso para el flujo de soporte, centralizados igual que
 * `auth-limits.ts`/`reservation-limits.ts` — un solo lugar, configurable
 * por env, nunca un número suelto copiado en cada endpoint.
 */
export interface SupportLimits {
  /** Tickets nuevos permitidos por IP en la ventana. */
  createMaxPerWindow: number;
  createWindowSeconds: number;
  /** Mensajes de cliente permitidos por ticket+IP en la ventana. */
  messageMaxPerWindow: number;
  messageWindowSeconds: number;
  /** Un pedido más viejo que esto ya no admite ticket nuevo — ver `createSupportTicket`. */
  orderMaxAgeDays: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const SUPPORT_LIMITS: SupportLimits = {
  createMaxPerWindow: envInt("SUPPORT_CREATE_MAX_PER_WINDOW", 5),
  createWindowSeconds: envInt("SUPPORT_CREATE_WINDOW_SECONDS", 3600),
  messageMaxPerWindow: envInt("SUPPORT_MESSAGE_MAX_PER_WINDOW", 20),
  messageWindowSeconds: envInt("SUPPORT_MESSAGE_WINDOW_SECONDS", 3600),
  orderMaxAgeDays: envInt("SUPPORT_ORDER_MAX_AGE_DAYS", 21),
};

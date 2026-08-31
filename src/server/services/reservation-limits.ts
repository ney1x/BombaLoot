import "server-only";

/**
 * Límites de reservas activas por dueño (hallazgo A3 de la auditoría).
 *
 * Sin tope, cualquiera puede llamar `createReservation` en bucle con
 * `guest_key` arbitrarios y dejar todo el stock en `RESERVED` sin pagar nada
 * — inventario bloqueado indefinidamente por una tienda invendible, gratis
 * para el atacante.
 *
 * Centralizado acá a propósito: antes de este archivo, un límite "hardcodeado
 * en un solo lugar" tendía a terminar copiado en dos o tres sitios distintos
 * que se desincronizan. Cambiar el límite es cambiar este archivo, o las
 * variables de entorno de abajo — nunca un número suelto en un `if`.
 */
export interface ReservationLimits {
  /** Reservas ACTIVE simultáneas permitidas para un usuario autenticado. */
  maxActivePerUser: number;
  /** Reservas ACTIVE simultáneas permitidas para un guest_key. */
  maxActivePerGuest: number;
  /** Ventana y techo del rate limit HTTP de creación de reservas (capa API, fase 4). */
  createWindowSeconds: number;
  createMaxPerWindow: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const RESERVATION_LIMITS: ReservationLimits = {
  maxActivePerUser: envInt("RESERVATION_MAX_ACTIVE_PER_USER", 3),
  maxActivePerGuest: envInt("RESERVATION_MAX_ACTIVE_PER_GUEST", 1),
  createWindowSeconds: envInt("RESERVATION_RATE_LIMIT_WINDOW_SECONDS", 60),
  createMaxPerWindow: envInt("RESERVATION_RATE_LIMIT_MAX_PER_WINDOW", 5),
};

import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Identidad de invitado — un id estable por navegador, para que el tope de
 * reservas activas por invitado (`RESERVATION_LIMITS.maxActivePerGuest`,
 * fase de auditoría) tenga algo real que agrupar. No es un secreto de
 * acceso: a diferencia de la cookie de sesión o el token de un pedido, esta
 * cookie no autoriza nada por sí sola — solo agrupa "intentos de reserva
 * del mismo navegador". Igual va `httpOnly` para que no sea trivial de leer
 * o falsificar desde JS de terceros.
 *
 * Se lee y escribe SOLO desde Route Handlers (acá, dentro de
 * POST /api/checkout) — escribir cookies durante el render de una página
 * no está permitido en Next.
 */
export const GUEST_COOKIE_NAME = "loadout_guest";

const GUEST_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 año

export async function getOrCreateGuestKey(): Promise<string> {
  const store = await cookies();
  const existing = store.get(GUEST_COOKIE_NAME)?.value;
  if (existing) return existing;

  const key = randomBytes(16).toString("base64url");
  store.set(GUEST_COOKIE_NAME, key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
  });
  return key;
}

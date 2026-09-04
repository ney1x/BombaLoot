import "server-only";

import { SESSION_TTL_SECONDS, SESSION_TTL_SECONDS_SHORT } from "./session";

/**
 * Cookie de sesión. Nunca en `localStorage` — un XSS en cualquier parte del
 * sitio que pudiera leer `localStorage` se llevaría la sesión con él;
 * `httpOnly` hace que ni el propio código de la página pueda leerla.
 */
export const SESSION_COOKIE_NAME = "loadout_session";

/** Cookie efímera para llevar el token opaco de un pedido de invitado a través del registro. */
export const CLAIM_COOKIE_NAME = "loadout_claim";

/**
 * Una cookie POR PEDIDO (nombre dinámico), no una sola cookie con todos los
 * pedidos de un invitado — cada ruta que necesita el token ya tiene el
 * `orderId` en su propio contexto (segmento de path, o resuelto desde un
 * `payment_intent_id`), así que el servidor siempre puede calcular el nombre
 * exacto sin que el cliente enumere nada. Reemplaza el `accessToken` viajando
 * por query string/segmento de URL en el uso normal (hallazgo de la
 * auditoría de seguridad, 2026-09-04) — `httpOnly` además lo saca del
 * alcance de `sessionStorage`/JS, donde vivía antes.
 */
const ORDER_COOKIE_PREFIX = "loadout_order_";
const ORDER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 días — decidido con el usuario.

export function orderAccessCookieName(orderId: string): string {
  return `${ORDER_COOKIE_PREFIX}${orderId}`;
}

/**
 * Cookie efímera del ida-y-vuelta OAuth con Google — lleva el `state`
 * (anti-CSRF), el `code_verifier` de PKCE, y a dónde volver (`next`,
 * `claim`) mientras el navegador está en accounts.google.com. `Lax` alcanza
 * (no hace falta `None`): el callback de Google vuelve como navegación
 * top-level por GET, que `Lax` sí deja pasar — ver `cookieOptionsForEnv`.
 */
export const GOOGLE_OAUTH_COOKIE_NAME = "loadout_google_oauth";

/**
 * Firma mínima que cubren tanto `NextResponse.cookies` como el store que
 * devuelve `await cookies()` de `next/headers` — cualquiera de los dos sirve
 * acá, así que las rutas HTTP pueden usar el que les resulte más cómodo sin
 * que este archivo tenga que importar tipos de Next directamente.
 */
export interface CookieWriter {
  set(name: string, value: string, options?: Record<string, unknown>): void;
  delete(name: string): void;
}

/**
 * Función pura (recibe el NODE_ENV en vez de leerlo del ambiente) para que
 * los tests puedan verificar las tres propiedades de seguridad de la cookie
 * sin mutar `process.env` global.
 */
export function cookieOptionsForEnv(nodeEnv: string | undefined) {
  return {
    httpOnly: true,
    // Secure es obligatorio en producción (la cookie no debe viajar nunca
    // por HTTP plano); se desactiva solo en desarrollo porque `localhost`
    // normalmente no sirve HTTPS.
    secure: nodeEnv === "production",
    // Lax alcanza para este sitio: el login es same-site (formulario propio,
    // no un flujo OAuth de terceros que necesite `none`), y Lax ya bloquea
    // el caso clásico de CSRF vía navegación cross-site con métodos no-GET.
    sameSite: "lax" as const,
    path: "/",
  };
}

function baseCookieOptions() {
  return cookieOptionsForEnv(process.env.NODE_ENV);
}

export function setSessionCookie(
  writer: CookieWriter,
  token: string,
  options: { remember: boolean },
): void {
  writer.set(SESSION_COOKIE_NAME, token, {
    ...baseCookieOptions(),
    // "Recordarme" → cookie persistente con el mismo TTL que la sesión en
    // la base. Sin tildar → cookie de sesión del navegador (sin maxAge): se
    // borra al cerrar el navegador, aunque la fila en `sessions` siga viva
    // hasta las 12h como techo — revocarla ahí es responsabilidad del login
    // siguiente o de un logout explícito, no de esta cookie.
    maxAge: options.remember ? SESSION_TTL_SECONDS : undefined,
  });
}

export function clearSessionCookie(writer: CookieWriter): void {
  writer.delete(SESSION_COOKIE_NAME);
}

export function setClaimCookie(writer: CookieWriter, orderAccessToken: string): void {
  writer.set(CLAIM_COOKIE_NAME, orderAccessToken, {
    ...baseCookieOptions(),
    maxAge: 60 * 30, // 30 min: alcanza para completar el registro, no queda colgada.
  });
}

export function clearClaimCookie(writer: CookieWriter): void {
  writer.delete(CLAIM_COOKIE_NAME);
}

export function setOrderAccessCookie(writer: CookieWriter, orderId: string, token: string): void {
  writer.set(orderAccessCookieName(orderId), token, {
    ...baseCookieOptions(),
    maxAge: ORDER_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearOrderAccessCookie(writer: CookieWriter, orderId: string): void {
  writer.delete(orderAccessCookieName(orderId));
}

/**
 * Mismo patrón que la cookie de pedidos, aplicado al token de acceso de un
 * ticket de soporte de invitado (`support_tickets.access_token_hash`) —
 * recurso separado, mismo problema de transporte (viajaba por `?token=` en
 * cada fetch/poll/reply). Ver `orderAccessCookieName` arriba.
 */
const TICKET_COOKIE_PREFIX = "loadout_ticket_";

export function ticketAccessCookieName(ticketId: string): string {
  return `${TICKET_COOKIE_PREFIX}${ticketId}`;
}

export function setTicketAccessCookie(writer: CookieWriter, ticketId: string, token: string): void {
  writer.set(ticketAccessCookieName(ticketId), token, {
    ...baseCookieOptions(),
    maxAge: ORDER_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearTicketAccessCookie(writer: CookieWriter, ticketId: string): void {
  writer.delete(ticketAccessCookieName(ticketId));
}

export interface GoogleOAuthState {
  state: string;
  codeVerifier: string;
  next: string;
  claim?: string;
}

export function setGoogleOAuthCookie(writer: CookieWriter, value: GoogleOAuthState): void {
  writer.set(GOOGLE_OAUTH_COOKIE_NAME, JSON.stringify(value), {
    ...baseCookieOptions(),
    maxAge: 60 * 10, // 10 min: alcanza para elegir cuenta en Google y volver, no queda colgada.
  });
}

export function clearGoogleOAuthCookie(writer: CookieWriter): void {
  writer.delete(GOOGLE_OAUTH_COOKIE_NAME);
}

export { SESSION_TTL_SECONDS_SHORT };

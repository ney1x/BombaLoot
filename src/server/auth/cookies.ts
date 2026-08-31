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

export { SESSION_TTL_SECONDS_SHORT };

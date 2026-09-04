import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Autenticación de los endpoints `/api/cron/*` (fase 8) — pensados para que
 * un scheduler externo gratuito (cron-job.org, EasyCron, GitHub Actions
 * cron, etc.) les pegue por HTTPS cada cierto tiempo, ya que el hosting
 * (Vercel) no corre nada por sí solo entre requests.
 *
 * Sin esto, cualquiera que adivine la URL podría disparar el barrido o el
 * worker de reembolsos a demanda — no son operaciones destructivas por sí
 * mismas (todas son idempotentes), pero sí consumen conexiones a la base y
 * llaman a Wompi/PayPal, así que quedan detrás de un secreto igual.
 *
 * Acepta el secreto de dos formas — no todos los schedulers gratuitos dejan
 * mandar headers custom:
 *   1. Header `Authorization: Bearer <CRON_SECRET>` (preferido — no queda
 *      en logs de acceso ni en el historial del navegador).
 *   2. Query param `?secret=<CRON_SECRET>` (fallback para el scheduler que
 *      solo permite configurar una URL).
 */
/**
 * Compara vía sha256 en vez de char por char (hallazgo de la auditoría de
 * seguridad, 2026-09-04): el chequeo de longitud previo (`a.length !==
 * b.length`) no era en sí mismo constant-time, así que en teoría filtraba
 * cuánto mide el secreto antes de comparar su valor. Hasheando los dos
 * lados primero, el resultado siempre mide 32 bytes — `timingSafeEqual`
 * nunca ve una diferencia de longitud que comparar. Mismo patrón que
 * `tokenMatches` en `auth/tokens.ts`.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sin secreto configurado, nunca autorizado — nunca "abierto por accidente".

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const provided = authHeader.slice("Bearer ".length);
    if (timingSafeStringEqual(provided, secret)) return true;
  }

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("secret");
  if (queryToken && timingSafeStringEqual(queryToken, secret)) return true;

  return false;
}

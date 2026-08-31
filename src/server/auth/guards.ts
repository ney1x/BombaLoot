import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "../db/client";
import { SESSION_COOKIE_NAME } from "./cookies";
import { validateSessionToken, type ValidatedSession } from "./session";
import { assertAdminOrSupportRole, assertAdminRole } from "./admin-guards";

/**
 * Helpers de autorización para Server Components y Route Handlers.
 *
 * Regla de todo este archivo, y la más importante de la fase: **la
 * autorización nunca confía en nada que mande el cliente.** No hay
 * `userId`/`role` leído de un body, de un query param, ni de un prop pasado
 * desde un componente cliente — el único dato de identidad válido es el que
 * sale de resolver la cookie `httpOnly` contra la tabla `sessions` acá
 * adentro, en el servidor, en cada request.
 *
 * No actualiza `last_seen_at` acá a propósito: un Server Component se puede
 * re-renderizar más de una vez por request (o cachearse) y no es el lugar
 * para un side-effect de escritura. Ese touch vive en el Route Handler de
 * `/api/auth/session`, que el cliente llama una vez por carga de página.
 */

export async function getCurrentSession(): Promise<ValidatedSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  return validateSessionToken(getDb(), token);
}

export async function getCurrentUser(): Promise<ValidatedSession | null> {
  return getCurrentSession();
}

/**
 * Exige una sesión válida. Redirige a `/cuenta/login` si no hay una — nunca
 * revela por qué (token ausente, vencido, o de una sesión revocada son
 * indistinguibles desde afuera).
 *
 * `redirectTo` se agrega como `?next=` para que el login pueda volver al
 * mismo lugar después de autenticar.
 */
export async function requireUser(redirectTo?: string): Promise<ValidatedSession> {
  const session = await getCurrentSession();
  if (!session) {
    const next = redirectTo ? `?next=${encodeURIComponent(redirectTo)}` : "";
    redirect(`/cuenta/login${next}`);
  }
  return session;
}

/**
 * Exige rol ADMIN. Un CUSTOMER autenticado que pega la URL de admin recibe
 * el mismo 404 que una ruta que no existe — no "403 sin permiso", que le
 * confirmaría que la ruta es real y solo le falta el rol. Evita la
 * enumeración de superficie administrativa desde una cuenta cualquiera.
 */
export async function requireAdmin(): Promise<ValidatedSession> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    notFound();
  }
  return session;
}

/**
 * Exige ADMIN o SUPPORT (páginas). Mismo criterio anti-enumeración que
 * `requireAdmin`: 404, nunca 403.
 */
export async function requireAdminOrSupport(): Promise<ValidatedSession> {
  const session = await getCurrentSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SUPPORT")) {
    notFound();
  }
  return session;
}

/**
 * Variantes para Route Handlers de `/api/admin/*`.
 *
 * A diferencia de `requireAdmin`/`requireAdminOrSupport` (páginas, 404 vía
 * `notFound()`), acá el llamador espera JSON: sin sesión es 401, con sesión
 * pero rol insuficiente es 403. `apiErrorToResponse` traduce los dos casos.
 * No hay ambigüedad de enumeración que proteger en la API admin — a
 * diferencia de una URL de cliente, no hay superficie pública que ocultar.
 *
 * La verificación de rol vive en `assertAdminRole`/`assertAdminOrSupportRole`
 * (`./admin-guards`) — funciones puras (sin cookies, sin DB) para poder
 * probar las cuatro combinaciones de rol sin necesitar un request real de
 * Next.
 */
export async function requireAdminApi(): Promise<ValidatedSession> {
  const session = await getCurrentSession();
  assertAdminRole(session);
  return session;
}

export async function requireAdminOrSupportApi(): Promise<ValidatedSession> {
  const session = await getCurrentSession();
  assertAdminOrSupportRole(session);
  return session;
}

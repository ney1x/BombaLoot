import "server-only";

import { ForbiddenError, UnauthorizedError } from "./errors";
import type { ValidatedSession } from "./session";

/**
 * Verificación de rol pura — sin `cookies()`, sin `next/headers`. Separada
 * de `guards.ts` a propósito: así se puede probar cada combinación de rol
 * sin depender de un request de Next real, y `guards.ts` (que sí importa
 * `next/headers`/`next/navigation`) queda como la única capa que toca
 * cookies.
 */
/** SUPERADMIN pasa cualquier chequeo de ADMIN — es superset, nunca un rol paralelo. */
export function assertAdminRole(session: ValidatedSession | null): asserts session is ValidatedSession {
  if (!session) throw new UnauthorizedError();
  if (session.role !== "ADMIN" && session.role !== "SUPERADMIN") throw new ForbiddenError();
}

export function assertAdminOrSupportRole(
  session: ValidatedSession | null,
): asserts session is ValidatedSession {
  if (!session) throw new UnauthorizedError();
  if (session.role !== "ADMIN" && session.role !== "SUPPORT" && session.role !== "SUPERADMIN") {
    throw new ForbiddenError();
  }
}

/** Solo para invitar/revocar/restaurar el rol ADMIN — la única capacidad que un ADMIN normal ya NO tiene. */
export function assertSuperAdminRole(session: ValidatedSession | null): asserts session is ValidatedSession {
  if (!session) throw new UnauthorizedError();
  if (session.role !== "SUPERADMIN") throw new ForbiddenError();
}

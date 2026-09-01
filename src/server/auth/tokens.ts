import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Tokens opacos para acceso sin cuenta (pedidos de invitado) y para sesiones.
 *
 * El número de pedido visible —"A7F3-2291"— NO es credencial: es corto,
 * enumerable y se muestra en pantalla y en correos. El acceso al código va
 * siempre por uno de estos tokens.
 *
 * Se guarda el sha256, no el token. Si alguien lee la base no puede fabricar
 * enlaces válidos, y revocar es escribir una fecha en `access_token_revoked_at`.
 */

const TOKEN_BYTES = 32; // 256 bits: no enumerable

export interface OpaqueToken {
  /** Va en la URL o en la cookie. Se muestra una sola vez. */
  value: string;
  /** Va en la base. */
  hash: Buffer;
}

export function createOpaqueToken(): OpaqueToken {
  const value = randomBytes(TOKEN_BYTES).toString("base64url");
  return { value, hash: hashToken(value) };
}

export function hashToken(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Comparación en tiempo constante, para no filtrar información por timing. */
export function tokenMatches(value: string, storedHash: Buffer): boolean {
  const candidate = hashToken(value);
  if (candidate.length !== storedHash.length) return false;
  return timingSafeEqual(candidate, storedHash);
}

/**
 * Número de pedido legible. Identifica al pedido para soporte y correos;
 * nunca autoriza nada por sí solo.
 */
export function generateOrderNumber(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin I,O,0,1
  const bytes = randomBytes(8);
  const block = (start: number, length: number) =>
    Array.from({ length }, (_, i) => alphabet[bytes[start + i] % alphabet.length]).join("");
  return `${block(0, 4)}-${block(4, 4)}`;
}

/** Mismo esquema que `generateOrderNumber`, con prefijo "T-" para no confundir un número de ticket con uno de pedido a simple vista. */
export function generateTicketNumber(): string {
  return `T-${generateOrderNumber()}`;
}

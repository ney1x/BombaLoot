import "server-only";

import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

/**
 * Contraseñas con Argon2id, parámetros por defecto de `@node-rs/argon2`
 * (m=19456 KiB, t=2, p=1) — son los recomendados por OWASP para argon2id
 * cuando no hay un perfilado propio del hardware de producción. Nunca se
 * loguea ni se persiste la contraseña en claro; esta es la única función que
 * la toca antes de descartarla.
 */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPasswordHash(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    // Un hash corrupto o de un formato viejo no debe tirar 500 — es
    // simplemente "esta contraseña no es correcta".
    return false;
  }
}

/**
 * Política de contraseña. 8 caracteres es el piso histórico de este
 * proyecto (`PasswordField` ya trae `minLength={8}` en el HTML) — se
 * mantiene el mismo número en el servidor para no crear una discrepancia
 * entre lo que el formulario deja escribir y lo que el servidor acepta.
 */
export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(200, "La contraseña es demasiado larga");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Ingresá un email válido")
  .max(320);

/** Normaliza un email para comparar/guardar: recorte y minúsculas. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

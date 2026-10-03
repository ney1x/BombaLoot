import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Cifrado de códigos de inventario.
 *
 * Dos claves distintas y separadas a propósito:
 *   CODE_ENCRYPTION_KEY   descifra el código  → solo la usa el handler de revelado
 *   CODE_FINGERPRINT_KEY  deduplica el código → la usa la carga de lotes
 *
 * La huella es HMAC y no un sha256 pelado: un código tipo "VLR-XXXX-XXXX"
 * tiene ~36^8 combinaciones, que un atacante con acceso a la base podría
 * recorrer contra un hash sin clave. Con HMAC, sin la pimienta no hay
 * diccionario que sirva.
 */

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;

function loadKey(name: "CODE_ENCRYPTION_KEY" | "CODE_FINGERPRINT_KEY"): Buffer {
  const raw = process.env[name];
  if (!raw) {
    throw new Error(
      `Falta ${name}. Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${name} debe ser exactamente 32 bytes en base64 (recibidos ${key.length})`);
  }
  return key;
}

/** Normaliza antes de cifrar y de deduplicar, para que la huella sea estable. */
export function normalizeCode(plain: string): string {
  return plain.trim().toUpperCase();
}

export interface EncryptedCode {
  cipher: Buffer;
  nonce: Buffer;
  tag: Buffer;
  fingerprint: Buffer;
}

export function encryptCode(plain: string): EncryptedCode {
  const normalized = normalizeCode(plain);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, loadKey("CODE_ENCRYPTION_KEY"), nonce);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);

  return {
    cipher: encrypted,
    nonce,
    tag: cipher.getAuthTag(),
    fingerprint: fingerprintCode(normalized),
  };
}

export function decryptCode(input: { cipher: Buffer; nonce: Buffer; tag: Buffer }): string {
  const decipher = createDecipheriv(ALGORITHM, loadKey("CODE_ENCRYPTION_KEY"), input.nonce);
  decipher.setAuthTag(input.tag);
  return Buffer.concat([decipher.update(input.cipher), decipher.final()]).toString("utf8");
}

export function fingerprintCode(plain: string): Buffer {
  return createHmac("sha256", loadKey("CODE_FINGERPRINT_KEY"))
    .update(normalizeCode(plain))
    .digest();
}

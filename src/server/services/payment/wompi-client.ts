import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { WompiApiError } from "./errors";

/**
 * Cliente HTTP de Wompi. Solo transporte + firma — ninguna regla de negocio
 * vive acá (eso es `webhook-service.ts`/`refund-service.ts`).
 *
 * Wompi separa dos firmas distintas que no hay que confundir:
 *  - "Integridad": la que ESTE archivo calcula al CREAR una transacción
 *    (`signWompiReference`), para que Wompi confirme que el monto que ve en
 *    su checkout es el que nosotros pedimos.
 *  - "Eventos": la que Wompi manda en cada webhook (`verifyWompiWebhookSignature`),
 *    para que nosotros confirmemos que el webhook es de Wompi.
 * Comparten el nombre "signature" en la documentación pero son secretos y
 * fórmulas distintos — `WOMPI_INTEGRITY_SECRET` vs `WOMPI_EVENTS_SECRET`.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name}`);
  return value;
}

/**
 * Fase 7 (hallazgo del análisis): esto ANTES caía a
 * `https://production.wompi.co/v1` si `WOMPI_API_URL` no estaba seteada.
 * Una clave `pub_test_`/`prv_test_` (sandbox) no autentica contra la API de
 * producción — el fallo era silencioso hasta el primer intento real de
 * consultar una transacción o hacer un void, que volvía 401 sin ninguna
 * pista de por qué. Ahora es obligatoria, como el resto de las variables de
 * Wompi: cada ambiente declara explícitamente a qué API le está pegando.
 *   Sandbox:     https://sandbox.wompi.co/v1     (con claves pub_test_/prv_test_)
 *   Producción:  https://production.wompi.co/v1  (con claves pub_prod_/prv_prod_)
 * El checkout alojado (`checkout.wompi.co/p/`) es la misma URL en los dos
 * casos — el ambiente lo determina la public key que se le pasa, no el
 * dominio.
 */
function wompiBaseUrl(): string {
  return requireEnv("WOMPI_API_URL");
}

/* ────────────────────────── firma de integridad (al crear) ────────────────────────── */

export function signWompiReference(reference: string, amountInCents: number, currency: string): string {
  const raw = `${reference}${amountInCents}${currency}${requireEnv("WOMPI_INTEGRITY_SECRET")}`;
  return createHash("sha256").update(raw).digest("hex");
}

/* ────────────────────────── checkout alojado ────────────────────────── */

/**
 * Wompi no tiene un POST que "cree" la transacción de nuestro lado para el
 * flujo de checkout alojado: se redirige al navegador a esta URL firmada
 * (widget de Wompi), y es EL WIDGET el que crea la transacción cuando el
 * cliente completa el pago — con el mismo `reference` que elegimos acá.
 * Nuestro backend nunca ve un `transaction.id` hasta el webhook o hasta
 * consultar por `reference` (`getWompiTransactionByReference`).
 */
export interface WompiCheckoutUrlParams {
  reference: string;
  amountInCents: number;
  currency: string;
  redirectUrl: string;
  customerEmail?: string;
}

export function buildWompiCheckoutUrl(params: WompiCheckoutUrlParams): string {
  const signature = signWompiReference(params.reference, params.amountInCents, params.currency);
  const url = new URL("https://checkout.wompi.co/p/");
  url.searchParams.set("public-key", requireEnv("WOMPI_PUBLIC_KEY"));
  url.searchParams.set("currency", params.currency);
  url.searchParams.set("amount-in-cents", String(params.amountInCents));
  url.searchParams.set("reference", params.reference);
  url.searchParams.set("signature:integrity", signature);
  url.searchParams.set("redirect-url", params.redirectUrl);
  if (params.customerEmail) url.searchParams.set("customer-data:email", params.customerEmail);
  return url.toString();
}

/* ────────────────────────── consulta de transacciones ────────────────────────── */

export type WompiTransactionStatus = "PENDING" | "APPROVED" | "DECLINED" | "VOIDED" | "ERROR";

export interface WompiTransactionData {
  id: string;
  reference: string;
  status: WompiTransactionStatus;
  amount_in_cents: number;
  currency: string;
  payment_method_type?: string;
  customer_email?: string;
  created_at?: string;
}

export interface WompiTransactionResponse {
  data: WompiTransactionData;
}

export interface WompiTransactionListResponse {
  data: WompiTransactionData[];
}

async function wompiFetch<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${wompiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireEnv("WOMPI_PRIVATE_KEY")}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const body = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw new WompiApiError(response.status, JSON.stringify(body));
  }
  return body;
}

export async function getWompiTransaction(transactionId: string): Promise<WompiTransactionResponse> {
  return wompiFetch<WompiTransactionResponse>(`/transactions/${encodeURIComponent(transactionId)}`, {
    method: "GET",
  });
}

/**
 * Camino para el caso "webhook perdido": nuestro `payment_intent` solo
 * conoce el `reference` que nosotros elegimos hasta que llega el webhook, y
 * ese es exactamente el filtro que Wompi expone para buscar sin `id`.
 * Se queda con la transacción más reciente si hay más de una (reintentos
 * del cliente en el widget).
 */
export async function getWompiTransactionByReference(reference: string): Promise<WompiTransactionData | undefined> {
  const response = await wompiFetch<WompiTransactionListResponse>(
    `/transactions?reference=${encodeURIComponent(reference)}`,
    { method: "GET" },
  );
  const [latest] = [...response.data].sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
  );
  return latest;
}

/**
 * Único mecanismo de reversión que Wompi expone después de crear una
 * transacción: VOID, no un "refund" post-captura genérico. Solo funciona
 * mientras la transacción sigue en un estado que lo permite — ver
 * `WompiRefundNotSupportedError` en `refund-service.ts` para qué pasa
 * cuando no. `idempotencyKey` va en el header `idempotency-key` (24h TTL
 * documentado del lado de Wompi; `refund_requests.provider_request_id` es
 * la barrera real, que no depende de esa ventana).
 */
export async function voidWompiTransaction(
  transactionId: string,
  idempotencyKey: string,
): Promise<WompiTransactionResponse> {
  return wompiFetch<WompiTransactionResponse>(`/transactions/${encodeURIComponent(transactionId)}/void`, {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: "{}",
  });
}

/* ────────────────────────── firma de eventos (webhook) ────────────────────────── */

/**
 * Forma real del payload de eventos de Wompi: `signature.properties` es una
 * lista de rutas dentro de `data` (p. ej. `"transaction.id"`), y el checksum
 * es sha256 de la concatenación de esos valores, en ese orden, más
 * `timestamp`, más el secreto de eventos.
 */
export interface WompiEventPayload {
  event: string;
  data: Record<string, unknown>;
  signature: { checksum: string; properties: string[] };
  timestamp: number;
  sent_at?: string;
}

function resolvePath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyWompiWebhookSignature(event: WompiEventPayload): boolean {
  if (!event.signature || !Array.isArray(event.signature.properties)) return false;

  const concatenated =
    event.signature.properties.map((path) => String(resolvePath(event.data, path) ?? "")).join("") +
    String(event.timestamp) +
    requireEnv("WOMPI_EVENTS_SECRET");

  const expected = createHash("sha256").update(concatenated).digest("hex");
  return timingSafeEqualHex(expected, event.signature.checksum);
}

/** Extrae la transacción del payload de evento, con las rutas que Wompi documenta. */
export function extractWompiTransaction(event: WompiEventPayload): WompiTransactionData | undefined {
  const tx = event.data.transaction;
  if (!tx || typeof tx !== "object") return undefined;
  return tx as WompiTransactionData;
}

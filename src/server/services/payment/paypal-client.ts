import "server-only";

import { PaypalApiError } from "./errors";

/**
 * Cliente HTTP de PayPal. Solo transporte — ninguna regla de negocio vive
 * acá.
 *
 * Verificación de webhook: PayPal firma con RSA sobre una cadena que
 * incluye el certificado publicado en `cert_url`, cuya cadena de confianza
 * hay que validar contra la CA de PayPal. Reimplementar esa verificación a
 * mano es exactamente el tipo de criptografía que no conviene escribir de
 * cero — PayPal expone `POST /v1/notifications/verify-webhook-signature`
 * para que el verificador sea PayPal mismo, no una reimplementación
 * nuestra. Es la vía que este archivo usa.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name}`);
  return value;
}

/**
 * Fase 7 (mismo hallazgo que en wompi-client.ts): esto ANTES caía a
 * `https://api-m.paypal.com` (producción) si `PAYPAL_API_URL` no estaba
 * seteada — un `PAYPAL_CLIENT_ID`/`SECRET` de sandbox nunca autentica ahí.
 * A diferencia de Wompi, acá no hay un dominio de checkout separado que
 * distinga ambiente (la `approvalUrl` sale de la propia respuesta de la
 * API, así que ya apunta al lado correcto): la única variable que importa
 * es esta.
 *   Sandbox:     https://api-m.sandbox.paypal.com  (app sandbox de developer.paypal.com)
 *   Producción:  https://api-m.paypal.com           (app live)
 */
function paypalBaseUrl(): string {
  return requireEnv("PAYPAL_API_URL");
}

/* ────────────────────────── OAuth2 (client credentials) ────────────────────────── */

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | undefined;

/** Solo para tests: fuerza a pedir un token nuevo en la próxima llamada. */
export function resetPaypalTokenCache(): void {
  cachedToken = undefined;
}

async function getPaypalAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const basic = Buffer.from(`${requireEnv("PAYPAL_CLIENT_ID")}:${requireEnv("PAYPAL_CLIENT_SECRET")}`).toString(
    "base64",
  );

  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new PaypalApiError(response.status, await response.text());
  }

  const body = (await response.json()) as { access_token: string; expires_in: number };
  // Margen de 60s antes del vencimiento real, para no usar un token que
  // expira a mitad de la siguiente llamada.
  cachedToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
  return cachedToken.token;
}

async function paypalFetch<T>(path: string, init: RequestInit): Promise<T> {
  const token = await getPaypalAccessToken();
  const response = await fetch(`${paypalBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const body = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw new PaypalApiError(response.status, JSON.stringify(body));
  }
  return body;
}

/* ────────────────────────── orders ────────────────────────── */

export interface PaypalCapture {
  id: string;
  status: string;
  amount?: { currency_code: string; value: string };
}

export interface PaypalOrderResponse {
  id: string;
  status: string;
  links?: Array<{ rel: string; href: string }>;
  purchase_units?: Array<{
    reference_id?: string;
    amount?: { currency_code: string; value: string };
    payments?: { captures?: PaypalCapture[] };
  }>;
}

export interface CreatePaypalOrderParams {
  referenceId: string;
  amountUsd: string;
  returnUrl: string;
  cancelUrl: string;
}

export async function createPaypalOrder(params: CreatePaypalOrderParams): Promise<PaypalOrderResponse> {
  return paypalFetch<PaypalOrderResponse>("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: params.referenceId,
          amount: { currency_code: "USD", value: params.amountUsd },
        },
      ],
      application_context: {
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
        user_action: "PAY_NOW",
      },
    }),
  });
}

export async function getPaypalOrder(paypalOrderId: string): Promise<PaypalOrderResponse> {
  return paypalFetch<PaypalOrderResponse>(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, {
    method: "GET",
  });
}

/** `requestId` va en el header `PayPal-Request-Id` — idempotente del lado de PayPal para esa captura. */
export async function capturePaypalOrder(paypalOrderId: string, requestId: string): Promise<PaypalOrderResponse> {
  return paypalFetch<PaypalOrderResponse>(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: "POST",
    headers: { "PayPal-Request-Id": requestId },
    body: "{}",
  });
}

/* ────────────────────────── refunds ────────────────────────── */

export interface PaypalRefundResponse {
  id: string;
  status: string;
  amount?: { currency_code: string; value: string };
}

/**
 * Reembolso total (body vacío) de una captura. `requestId` es
 * `refund_requests.provider_request_id` — guardado en nuestra base ANTES
 * de esta llamada, así que un reintento (timeout, caída del worker) manda
 * el MISMO id y PayPal devuelve el reembolso ya existente en vez de crear
 * uno nuevo.
 */
export async function refundPaypalCapture(captureId: string, requestId: string): Promise<PaypalRefundResponse> {
  return paypalFetch<PaypalRefundResponse>(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: "POST",
    headers: { "PayPal-Request-Id": requestId },
    body: "{}",
  });
}

/* ────────────────────────── verificación de webhook ────────────────────────── */

export interface PaypalWebhookHeaders {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
}

/**
 * Delega la verificación a PayPal mismo (ver comentario de archivo). Un
 * `false` acá — incluida cualquier falla de red al verificar — nunca debe
 * traducirse en "tratar el webhook como válido": el llamador corta en
 * cuanto esto no es `true`.
 */
export async function verifyPaypalWebhookSignature(
  headers: PaypalWebhookHeaders,
  webhookEvent: unknown,
): Promise<boolean> {
  const webhookId = requireEnv("PAYPAL_WEBHOOK_ID");
  const body = await paypalFetch<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({
      transmission_id: headers.transmissionId,
      transmission_time: headers.transmissionTime,
      cert_url: headers.certUrl,
      auth_algo: headers.authAlgo,
      transmission_sig: headers.transmissionSig,
      webhook_id: webhookId,
      webhook_event: webhookEvent,
    }),
  }).catch(() => ({ verification_status: "FAILURE" }) as { verification_status?: string });

  return body.verification_status === "SUCCESS";
}

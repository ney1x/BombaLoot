/** El pedido no está en un estado desde el que se pueda iniciar un pago (ya pagado, vencido, etc). */
export class OrderNotPayableError extends Error {
  readonly code = "ORDER_NOT_PAYABLE";

  constructor(
    readonly orderId: string,
    readonly currentStatus: string,
  ) {
    super(`El pedido ${orderId} no admite un nuevo intento de pago (estado: ${currentStatus})`);
    this.name = "OrderNotPayableError";
  }
}

/** El pedido no existe, o el `accessToken`/sesión no prueba propiedad sobre él. */
export class OrderNotFoundError extends Error {
  readonly code = "ORDER_NOT_FOUND";

  constructor() {
    super("Pedido no encontrado");
    this.name = "OrderNotFoundError";
  }
}

/** La firma del webhook no coincide con lo calculado — nunca se procesa el evento. */
export class InvalidWebhookSignatureError extends Error {
  readonly code = "INVALID_WEBHOOK_SIGNATURE";

  constructor(readonly provider: string) {
    super(`Firma de webhook inválida (${provider})`);
    this.name = "InvalidWebhookSignatureError";
  }
}

/** El webhook referencia un `payment_intent` que no existe del lado nuestro. */
export class WebhookOrphanError extends Error {
  readonly code = "WEBHOOK_ORPHAN";

  constructor(readonly reference: string) {
    super(`El webhook referencia "${reference}", que no matchea ningún payment_intent`);
    this.name = "WebhookOrphanError";
  }
}

/** El monto o la moneda del webhook no coinciden con lo que el payment_intent registró. */
export class WebhookAmountMismatchError extends Error {
  readonly code = "WEBHOOK_AMOUNT_MISMATCH";

  constructor(
    readonly expected: number,
    readonly received: number,
  ) {
    super(`Monto del webhook (${received}) no coincide con el esperado (${expected})`);
    this.name = "WebhookAmountMismatchError";
  }
}

export class WebhookCurrencyMismatchError extends Error {
  readonly code = "WEBHOOK_CURRENCY_MISMATCH";

  constructor(
    readonly expected: string,
    readonly received: string,
  ) {
    super(`Moneda del webhook (${received}) no coincide con la esperada (${expected})`);
    this.name = "WebhookCurrencyMismatchError";
  }
}

/** Error de red/HTTP al llamar la API de Wompi. */
export class WompiApiError extends Error {
  readonly code = "WOMPI_API_ERROR";

  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Wompi respondió ${status}: ${body}`);
    this.name = "WompiApiError";
  }
}

/** Error de red/HTTP al llamar la API de PayPal. */
export class PaypalApiError extends Error {
  readonly code = "PAYPAL_API_ERROR";

  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`PayPal respondió ${status}: ${body}`);
    this.name = "PaypalApiError";
  }
}

/**
 * Wompi no ofrece refund API para una transacción ya capturada — solo void,
 * y solo mientras la transacción lo permite. Cuando ninguna de las dos
 * aplica, el `refund_request` cae a `MANUAL_REVIEW_REQUIRED` en vez de
 * intentar inventar una llamada que no existe.
 */
export class WompiRefundNotSupportedError extends Error {
  readonly code = "WOMPI_REFUND_NOT_SUPPORTED";

  constructor(readonly transactionId: string) {
    super(`Wompi no admite void/refund para la transacción ${transactionId} en este estado`);
    this.name = "WompiRefundNotSupportedError";
  }
}

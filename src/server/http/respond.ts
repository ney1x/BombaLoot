import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  AccountSuspendedError,
  CannotSuspendAdminError,
  EmailAlreadyRegisteredError,
  ForbiddenError,
  InvalidCredentialsError,
  InvalidCurrentPasswordError,
  InvalidOrderTokenError,
  InvalidResetTokenError,
  InvalidSuspensionStateError,
  InvalidTicketTokenError,
  InvalidRoleTransitionError,
  OrderAlreadyClaimedError,
  SelfRoleChangeError,
  SelfSuspensionError,
  TargetUserNotFoundError,
  UnauthorizedError,
} from "../auth/errors";
import {
  AdminOrderNotFoundError,
  CodeNotEditableError,
  CodeNotFoundError,
  CodeNotOwnedError,
  DiscountCodeInvalidError,
  DiscountRuleNotFoundError,
  DuplicateCodeError,
  DuplicateDiscountCodeError,
  DuplicateLoyaltyTierError,
  DuplicateProductError,
  EmptyCartError,
  GameVisualNotFoundError,
  ImageNotFoundError,
  InsufficientStockError,
  InvalidGameError,
  InvalidProductError,
  InvalidQuantityError,
  IpBlockedError,
  IpBlockNotFoundError,
  LoyaltyCouponInvalidError,
  LoyaltyTierNotFoundError,
  MissingOwnerError,
  NoDeliveredCodesError,
  NoOpenTicketForOrderError,
  OrderNotCancellableError,
  OrderNotPaidError,
  OrderVerificationMismatchError,
  ProductNotFoundError,
  QuantityNotAllowedError,
  RefundNotPendingManualReviewError,
  RefundOrderMismatchError,
  RefundRequestNotFoundError,
  ReservationExpiredError,
  SupportOrderNotFoundError,
  SupportTicketNotFoundError,
} from "../services/errors";
import { RateLimitExceededError } from "../services/rate-limit";
import {
  InvalidWebhookSignatureError,
  OrderNotFoundError,
  OrderNotPayableError,
  WebhookAmountMismatchError,
  WebhookCurrencyMismatchError,
  WebhookOrphanError,
} from "../services/payment/errors";

/**
 * Traduce un error de servicio a una respuesta HTTP, en un solo lugar, para
 * que ninguna ruta improvise su propio mensaje ni filtre un `error.message`
 * crudo de Postgres o de Node al cliente. Todo lo que no es un error de
 * dominio conocido cae al `catch-all` 500 genérico.
 *
 * Cubre tanto los errores de auth (fase 3) como los del checkout (fase 4) —
 * es deliberadamente un solo mapeador para toda la API, no uno por
 * feature, así que un error nuevo se agrega acá una vez y todas las rutas
 * lo heredan igual.
 */
export function apiErrorToResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Datos inválidos", fields: error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (error instanceof RateLimitExceededError) {
    return NextResponse.json(
      { error: "Demasiados intentos. Probá de nuevo en unos minutos." },
      { status: 429 },
    );
  }

  // ── auth (fase 3) ──
  if (error instanceof InvalidCredentialsError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof AccountSuspendedError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof EmailAlreadyRegisteredError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof InvalidResetTokenError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof InvalidCurrentPasswordError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof InvalidOrderTokenError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof OrderAlreadyClaimedError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof InvalidTicketTokenError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  // ── admin / roles (fase 6A) ──
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (
    error instanceof ForbiddenError ||
    error instanceof SelfRoleChangeError ||
    error instanceof SelfSuspensionError ||
    error instanceof CannotSuspendAdminError
  ) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof TargetUserNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof InvalidRoleTransitionError || error instanceof InvalidSuspensionStateError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  // ── admin — productos, códigos, pedidos, reembolsos (fase 6B) ──
  if (
    error instanceof ProductNotFoundError ||
    error instanceof CodeNotFoundError ||
    error instanceof AdminOrderNotFoundError ||
    error instanceof RefundRequestNotFoundError ||
    error instanceof SupportTicketNotFoundError ||
    error instanceof ImageNotFoundError ||
    error instanceof GameVisualNotFoundError ||
    error instanceof LoyaltyTierNotFoundError ||
    error instanceof DiscountRuleNotFoundError
  ) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (
    error instanceof InvalidGameError ||
    error instanceof RefundOrderMismatchError ||
    error instanceof OrderVerificationMismatchError
  ) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof CodeNotOwnedError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (
    error instanceof DuplicateProductError ||
    error instanceof DuplicateCodeError ||
    error instanceof CodeNotEditableError ||
    error instanceof RefundNotPendingManualReviewError ||
    error instanceof DuplicateLoyaltyTierError ||
    error instanceof DuplicateDiscountCodeError ||
    error instanceof OrderNotCancellableError ||
    error instanceof NoDeliveredCodesError ||
    error instanceof OrderNotPaidError ||
    error instanceof NoOpenTicketForOrderError
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  // ── checkout (fase 4) ──
  if (error instanceof EmptyCartError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof InvalidQuantityError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof InvalidProductError) {
    // 400, no 404: no es "recurso no encontrado" en el sentido REST — es
    // "tu carrito menciona un producto que ya no es válido", un error del
    // pedido que se está armando, no de una URL.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof QuantityNotAllowedError || error instanceof InsufficientStockError) {
    return NextResponse.json({ error: "No hay suficiente disponibilidad para tu pedido." }, { status: 409 });
  }
  if (error instanceof ReservationExpiredError) {
    return NextResponse.json({ error: "Tu reserva expiró. Volvé a intentar desde el carrito." }, { status: 409 });
  }
  if (error instanceof MissingOwnerError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof DiscountCodeInvalidError || error instanceof LoyaltyCouponInvalidError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof SupportOrderNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof IpBlockedError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof IpBlockNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  // ── pagos (fase 5) ──
  if (error instanceof OrderNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof OrderNotPayableError) {
    return NextResponse.json({ error: "Este pedido no admite un nuevo intento de pago." }, { status: 409 });
  }
  if (
    error instanceof InvalidWebhookSignatureError ||
    error instanceof WebhookAmountMismatchError ||
    error instanceof WebhookCurrencyMismatchError
  ) {
    return NextResponse.json({ error: "Webhook rechazado" }, { status: 401 });
  }
  if (error instanceof WebhookOrphanError) {
    return NextResponse.json({ error: "Referencia no encontrada" }, { status: 404 });
  }

  console.error("[api] error inesperado:", error);
  return NextResponse.json({ error: "Algo salió mal. Intentá de nuevo." }, { status: 500 });
}

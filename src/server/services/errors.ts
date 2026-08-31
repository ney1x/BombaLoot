/** El producto no tenía suficientes códigos tomables en el momento del reclamo. */
export class InsufficientStockError extends Error {
  readonly code = "INSUFFICIENT_STOCK";

  constructor(
    readonly productId: string,
    readonly requested: number,
    readonly claimed: number,
  ) {
    super(
      `Stock insuficiente para ${productId}: se pidieron ${requested} y solo se pudieron tomar ${claimed}`,
    );
    this.name = "InsufficientStockError";
  }
}

/** La reserva ya no está ACTIVE, o venció antes de convertirse en pedido. */
export class ReservationExpiredError extends Error {
  readonly code = "RESERVATION_EXPIRED";

  constructor(readonly reservationId: string) {
    super(`La reserva ${reservationId} ya no está activa`);
    this.name = "ReservationExpiredError";
  }
}

/** Se pidió más de lo que el producto permite por pedido. */
export class QuantityNotAllowedError extends Error {
  readonly code = "QUANTITY_NOT_ALLOWED";

  constructor(
    readonly productId: string,
    readonly requested: number,
    readonly maxPerOrder: number,
  ) {
    super(`${productId} admite hasta ${maxPerOrder} por pedido; se pidieron ${requested}`);
    this.name = "QuantityNotAllowedError";
  }
}

/**
 * `product_id` inexistente, o de un producto que existe pero está inactivo.
 * Mismo mensaje para ambos casos a propósito: distinguirlos no le sirve a
 * nadie en el frontend, y evita filtrar si un id "casi válido" en verdad
 * corresponde a un producto real que el catálogo dejó de vender.
 */
export class InvalidProductError extends Error {
  readonly code = "INVALID_PRODUCT";

  constructor(readonly productId: string) {
    super(`El producto ${productId} no existe o no está disponible`);
    this.name = "InvalidProductError";
  }
}

/** `quantity` que no es un entero positivo razonable — antes de tocar la base. */
export class InvalidQuantityError extends Error {
  readonly code = "INVALID_QUANTITY";

  constructor(
    readonly productId: string,
    readonly quantity: unknown,
  ) {
    super(`Cantidad inválida para ${productId}`);
    this.name = "InvalidQuantityError";
  }
}

/** El carrito no tiene líneas, o todas fueron rechazadas. */
export class EmptyCartError extends Error {
  readonly code = "EMPTY_CART";

  constructor() {
    super("El carrito está vacío");
    this.name = "EmptyCartError";
  }
}

/** No hay una sesión ni un contexto de invitado válido para asociar el pedido. */
export class MissingOwnerError extends Error {
  readonly code = "MISSING_OWNER";

  constructor() {
    super("Falta identificar al comprador");
    this.name = "MissingOwnerError";
  }
}

/* ────────────────────────── admin — productos y códigos (fase 6B) ────────────────────────── */

export class ProductNotFoundError extends Error {
  readonly code = "PRODUCT_NOT_FOUND";
  constructor(readonly productId: string) {
    super(`El producto ${productId} no existe`);
    this.name = "ProductNotFoundError";
  }
}

export class DuplicateProductError extends Error {
  readonly code = "DUPLICATE_PRODUCT";
  constructor(message: string) {
    super(message);
    this.name = "DuplicateProductError";
  }
}

export class InvalidGameError extends Error {
  readonly code = "INVALID_GAME";
  constructor(readonly gameId: string) {
    super(`El juego ${gameId} no existe`);
    this.name = "InvalidGameError";
  }
}

export class CodeNotFoundError extends Error {
  readonly code = "CODE_NOT_FOUND";
  constructor(readonly codeId: string) {
    super(`El código ${codeId} no existe`);
    this.name = "CodeNotFoundError";
  }
}

/** El código ya no está en `AVAILABLE` (reservado, vendido, o anulado) — inmutable desde el admin. */
export class CodeNotEditableError extends Error {
  readonly code = "CODE_NOT_EDITABLE";
  constructor(readonly codeId: string, readonly status: string) {
    super(`El código ${codeId} está en estado ${status} y ya no se puede editar ni eliminar`);
    this.name = "CodeNotEditableError";
  }
}

/** El código pertenece a un lote subido por otro admin — solo su dueño puede editarlo o borrarlo. */
export class CodeNotOwnedError extends Error {
  readonly code = "CODE_NOT_OWNED";
  constructor(readonly codeId: string) {
    super(`Este código fue cargado por otro admin — solo quien lo subió puede editarlo o eliminarlo`);
    this.name = "CodeNotOwnedError";
  }
}

export class DuplicateCodeError extends Error {
  readonly code = "DUPLICATE_CODE";
  constructor(message = "Ese código ya existe en el inventario") {
    super(message);
    this.name = "DuplicateCodeError";
  }
}

export class LoyaltyTierNotFoundError extends Error {
  readonly code = "LOYALTY_TIER_NOT_FOUND";
  constructor(readonly tierId: string) {
    super(`El nivel de fidelización ${tierId} no existe`);
    this.name = "LoyaltyTierNotFoundError";
  }
}

export class DuplicateLoyaltyTierError extends Error {
  readonly code = "DUPLICATE_LOYALTY_TIER";
  constructor(message = "Ya existe un nivel con ese id o esa cantidad mínima de compras") {
    super(message);
    this.name = "DuplicateLoyaltyTierError";
  }
}

export class DiscountRuleNotFoundError extends Error {
  readonly code = "DISCOUNT_RULE_NOT_FOUND";
  constructor(readonly discountId: string) {
    super(`El descuento ${discountId} no existe`);
    this.name = "DiscountRuleNotFoundError";
  }
}

export class DuplicateDiscountCodeError extends Error {
  readonly code = "DUPLICATE_DISCOUNT_CODE";
  constructor(message = "Ya existe un descuento con ese código") {
    super(message);
    this.name = "DuplicateDiscountCodeError";
  }
}

export class ImageNotFoundError extends Error {
  readonly code = "IMAGE_NOT_FOUND";
  constructor(readonly imageId: string) {
    super(`La imagen ${imageId} no existe`);
    this.name = "ImageNotFoundError";
  }
}

export class GameVisualNotFoundError extends Error {
  readonly code = "GAME_VISUAL_NOT_FOUND";
  constructor(readonly visualId: string) {
    super(`El banner ${visualId} no existe`);
    this.name = "GameVisualNotFoundError";
  }
}

/* ────────────────────────── admin — pedidos y reembolsos (fase 6B) ────────────────────────── */

export class AdminOrderNotFoundError extends Error {
  readonly code = "ADMIN_ORDER_NOT_FOUND";
  constructor(readonly orderId: string) {
    super(`El pedido ${orderId} no existe`);
    this.name = "AdminOrderNotFoundError";
  }
}

export class RefundRequestNotFoundError extends Error {
  readonly code = "REFUND_REQUEST_NOT_FOUND";
  constructor(readonly refundRequestId: string) {
    super(`La solicitud de reembolso ${refundRequestId} no existe`);
    this.name = "RefundRequestNotFoundError";
  }
}

/** El refund_request no está en MANUAL_REVIEW_REQUIRED — no hay nada que un admin deba confirmar acá. */
export class RefundNotPendingManualReviewError extends Error {
  readonly code = "REFUND_NOT_PENDING_MANUAL_REVIEW";
  constructor(readonly refundRequestId: string, readonly status: string) {
    super(`La solicitud ${refundRequestId} está en estado ${status}, no MANUAL_REVIEW_REQUIRED`);
    this.name = "RefundNotPendingManualReviewError";
  }
}

/** El `orderId` que mandó el admin no corresponde al `refund_request` — protección contra un id copiado mal o manipulado. */
export class RefundOrderMismatchError extends Error {
  readonly code = "REFUND_ORDER_MISMATCH";
  constructor() {
    super("El pedido indicado no corresponde a esta solicitud de reembolso");
    this.name = "RefundOrderMismatchError";
  }
}

import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Fuente de verdad del modelo de datos, alineada 1:1 con
 * `migrations/0000_init.sql`. Ese SQL es lo que corre; este archivo da los
 * tipos. Cualquier cambio va en los dos lugares.
 */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const inet = customType<{ data: string; driverData: string }>({
  dataType: () => "inet",
});

/* ─────────────────────────── enums ─────────────────────────── */

export const userRole = pgEnum("user_role", ["CUSTOMER", "ADMIN", "SUPPORT"]);

export const codeStatus = pgEnum("code_status", [
  "AVAILABLE",
  "RESERVED",
  "PAID",
  "DELIVERED",
  "VOID",
]);

export const reservationStatus = pgEnum("reservation_status", [
  "ACTIVE",
  "CONSUMED",
  "EXPIRED",
  "CANCELLED",
]);

export const paymentStatus = pgEnum("payment_status", [
  "PENDING",
  "PAID",
  "FAILED",
  "REFUNDED",
]);

export const deliveryStatus = pgEnum("delivery_status", [
  "PENDING",
  "DELIVERED",
  "UNAVAILABLE",
]);

export const paymentProvider = pgEnum("payment_provider", ["WOMPI", "PAYPAL"]);
export const discountKind = pgEnum("discount_kind", ["PERCENT", "FIXED"]);
export const discountScope = pgEnum("discount_scope", ["ORDER", "GAME", "PRODUCT"]);

/**
 * `TIER_REACHED`: se otorga una vez por (usuario, nivel) al cruzar su
 * `min_purchases`. `REPEAT_INTERVAL`: solo para quien ya está en el nivel
 * más alto activo — uno nuevo cada `repeat_every_purchases` compras
 * adicionales, ver `loyalty_tiers.repeat_every_purchases`.
 */
export const loyaltyCouponReason = pgEnum("loyalty_coupon_reason", ["TIER_REACHED", "REPEAT_INTERVAL"]);

/**
 * REFUND_REQUEST se mantiene por los tickets viejos que ya lo tienen —
 * Postgres no deja borrar valores de un enum sin recrear el tipo. Ya no es
 * elegible al crear un ticket nuevo (ver `SUPPORT_CATEGORIES` en
 * lib/support.ts, que reemplaza esa opción por LOST_ORDER_NUMBER).
 */
export const supportTicketCategory = pgEnum("support_ticket_category", [
  "NO_CODE",
  "CODE_INVALID",
  "ORDER_ISSUE",
  "REFUND_REQUEST",
  "PAYMENT_PENDING",
  "DELIVERED_NOT_RECEIVED",
  "ACCOUNT_ISSUE",
  "OTHER",
  "LOST_ORDER_NUMBER",
]);

export const supportTicketStatus = pgEnum("support_ticket_status", [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
]);

export const supportMessageSender = pgEnum("support_message_sender", ["CUSTOMER", "ADMIN"]);

/* ─────────────────────────── identidad ─────────────────────────── */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash").notNull(),
    name: text("name"),
    role: userRole("role").notNull().default("CUSTOMER"),
    purchasesCount: integer("purchases_count").notNull().default(0),
    /** NOT NULL = cuenta suspendida. Nunca se borra la fila — ver 0010_account_suspension.sql. */
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),
    suspendedBy: uuid("suspended_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    /** NOT NULL = cuenta eliminada por el propio usuario (autoservicio, ver 0013_account_deletion.sql). Registro, no el mecanismo de bloqueo — eso lo hace reescribir `password_hash`. */
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_lower_key").on(sql`lower(${t.email})`),
    check("users_purchases_count_positive", sql`${t.purchasesCount} >= 0`),
    index("users_suspended_idx").on(t.suspendedAt).where(sql`suspended_at IS NOT NULL`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: bytea("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    ip: inet("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expiry_idx").on(t.expiresAt)],
);

/* ─────────────────────────── catálogo ─────────────────────────── */

export const games = pgTable("games", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  shortLabel: text("short_label").notNull(),
  colorDeep: text("color_deep").notNull(),
  colorBase: text("color_base").notNull(),
  colorTint: text("color_tint").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

/**
 * Sin columna de stock, a propósito. La disponibilidad se cuenta sobre `codes`
 * con el mismo predicado que usa el reclamo; un contador denormalizado es
 * justamente el campo que se desincroniza bajo concurrencia.
 */
export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "restrict" }),
    denomination: text("denomination").notNull(),
    unit: text("unit").notNull(),
    description: text("description"),
    priceCop: bigint("price_cop", { mode: "number" }).notNull(),
    maxPerOrder: integer("max_per_order").notNull().default(10),
    lowStockAt: integer("low_stock_at").notNull().default(5),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("products_variant_key").on(t.gameId, t.denomination, t.unit),
    index("products_game_idx").on(t.gameId),
    check("products_price_positive", sql`${t.priceCop} > 0`),
    check("products_max_per_order_positive", sql`${t.maxPerOrder} > 0`),
  ],
);

/**
 * Varias imágenes por producto, una marcada `isPrimary`, con orden — nunca
 * una sola columna fija en `products`. `productImagesOnePrimaryIdx` en
 * 0007_product_images.sql es lo que de verdad impide dos principales
 * activas a la vez; acá no hay ningún chequeo que lo reemplace.
 */
export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    altText: text("alt_text"),
    isPrimary: boolean("is_primary").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("product_images_product_idx").on(t.productId, t.sortOrder)],
);

/** Banners/hero reutilizables por juego — Home, tarjetas de producto, página de juego. */
export const gameVisuals = pgTable(
  "game_visuals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    title: text("title"),
    ctaText: text("cta_text"),
    ctaLink: text("cta_link"),
    /** 'hero' = banner grande de Home (1600×670); 'showcase' = panel de "Elegí tu juego" (600×800). */
    placement: text("placement").notNull().default("hero"),
    sortOrder: integer("sort_order").notNull().default(0),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("game_visuals_game_idx").on(t.gameId, t.sortOrder),
    check(
      "game_visuals_window",
      sql`${t.validUntil} IS NULL OR ${t.validFrom} IS NULL OR ${t.validUntil} > ${t.validFrom}`,
    ),
  ],
);

/* ─────────────────────────── comercial ─────────────────────────── */

export const loyaltyTiers = pgTable(
  "loyalty_tiers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    minPurchases: integer("min_purchases").notNull().unique(),
    discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull(),
    benefits: jsonb("benefits").notNull().default(sql`'[]'::jsonb`),
    sortOrder: integer("sort_order").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    /**
     * Solo tiene efecto en el nivel activo de `min_purchases` más alto: cada
     * tantas compras adicionales por encima de ese umbral, se otorga un
     * cupón de fidelización más — ver `ensureLoyaltyCoupons` en loyalty.ts.
     * NULL = no repite (el cliente deja de ganar cupones nuevos al quedarse
     * en el tope, aunque siga comprando).
     */
    repeatEveryPurchases: integer("repeat_every_purchases"),
  },
  (t) => [
    check("loyalty_min_purchases_positive", sql`${t.minPurchases} >= 0`),
    check("loyalty_discount_range", sql`${t.discountPct} >= 0 AND ${t.discountPct} <= 100`),
    check("loyalty_repeat_every_purchases_positive", sql`${t.repeatEveryPurchases} IS NULL OR ${t.repeatEveryPurchases} > 0`),
  ],
);

export const loyaltyCoupons = pgTable(
  "loyalty_coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tierId: text("tier_id")
      .notNull()
      .references(() => loyaltyTiers.id),
    /** Snapshot al momento de otorgarlo — un cambio de nombre/% en el nivel no debe alterar un cupón ya en la cuenta del cliente. */
    tierName: text("tier_name").notNull(),
    discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull(),
    reason: loyaltyCouponReason("reason").notNull(),
    /** El `purchases_count` exacto que ganó este cupón — la clave de dedupe contra `ensureLoyaltyCoupons` corriendo dos veces para el mismo hito. */
    milestonePurchases: integer("milestone_purchases").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    redeemedOrderId: uuid("redeemed_order_id").references((): AnyPgColumn => orders.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("loyalty_coupons_milestone_key").on(t.userId, t.tierId, t.reason, t.milestonePurchases),
    index("loyalty_coupons_user_available_idx").on(t.userId).where(sql`redeemed_at IS NULL`),
    check("loyalty_coupons_discount_range", sql`${t.discountPct} > 0 AND ${t.discountPct} <= 100`),
  ],
);

export const discountRules = pgTable(
  "discount_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").unique(),
    kind: discountKind("kind").notNull(),
    value: numeric("value", { precision: 12, scale: 2 }).notNull(),
    scope: discountScope("scope").notNull().default("ORDER"),
    scopeRef: text("scope_ref"),
    minSubtotalCop: bigint("min_subtotal_cop", { mode: "number" }).notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    maxUses: integer("max_uses"),
    usesCount: integer("uses_count").notNull().default(0),
    maxUsesPerUser: integer("max_uses_per_user"),
    stackable: boolean("stackable").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("discount_value_positive", sql`${t.value} > 0`),
    check("discount_window", sql`${t.endsAt} IS NULL OR ${t.startsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`),
    // El techo de canjes lo vigila la base: el servicio incrementa con
    // condición y comprueba filas afectadas, igual que el reclamo de códigos.
    check("discount_uses_within_max", sql`${t.maxUses} IS NULL OR ${t.usesCount} <= ${t.maxUses}`),
  ],
);

/* ─────────────────────────── pedidos ─────────────────────────── */

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number").notNull().unique(),
    /** sha256 del token opaco de acceso. El número de pedido NO es credencial. */
    accessTokenHash: bytea("access_token_hash").notNull().unique(),
    accessTokenRevokedAt: timestamp("access_token_revoked_at", { withTimezone: true }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    buyerName: text("buyer_name"),
    paymentStatus: paymentStatus("payment_status").notNull().default("PENDING"),
    deliveryStatus: deliveryStatus("delivery_status").notNull().default("PENDING"),
    subtotalCop: bigint("subtotal_cop", { mode: "number" }).notNull(),
    discountCop: bigint("discount_cop", { mode: "number" }).notNull().default(0),
    totalCop: bigint("total_cop", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("COP"),
    loyaltyTierId: text("loyalty_tier_id").references(() => loyaltyTiers.id, {
      onDelete: "restrict",
    }),
    paymentExpiresAt: timestamp("payment_expires_at", { withTimezone: true }),
    /** UUID que manda el cliente por intento de checkout. Ver 0003_checkout.sql. */
    idempotencyKey: text("idempotency_key").unique(),
    /** Por qué el último intento de pago no llegó a PAID. Solo para mostrar en UI/soporte. */
    lastPaymentError: text("last_payment_error"),
    /** 'nequi' · 'daviplata' · 'card' · 'paypal', tal como lo reporta el proveedor. */
    paymentMethod: text("payment_method"),
    /** Cuenta que efectivamente pagó (PayPal puede diferir del email de contacto). */
    payerEmail: text("payer_email"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_user_idx").on(t.userId),
    index("orders_email_idx").on(t.email),
    check("orders_amounts_positive", sql`${t.subtotalCop} >= 0 AND ${t.discountCop} >= 0 AND ${t.totalCop} >= 0`),
    // La aritmética del pedido la verifica el motor, no la aplicación.
    check("orders_total_matches", sql`${t.totalCop} = ${t.subtotalCop} - ${t.discountCop}`),
    check("orders_paid_has_timestamp", sql`${t.paymentStatus} <> 'PAID' OR ${t.paidAt} IS NOT NULL`),
    check("orders_currency_iso", sql`char_length(${t.currency}) = 3`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    // Snapshots: un cambio de precio o de nombre no reescribe la historia.
    gameLabel: text("game_label").notNull(),
    denomination: text("denomination").notNull(),
    unit: text("unit").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCop: bigint("unit_price_cop", { mode: "number" }).notNull(),
    lineTotalCop: bigint("line_total_cop", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("order_items_order_product_key").on(t.orderId, t.productId),
    check("order_items_quantity_positive", sql`${t.quantity} > 0`),
    check("order_items_line_total", sql`${t.lineTotalCop} = ${t.unitPriceCop} * ${t.quantity}`),
  ],
);

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: reservationStatus("status").notNull().default("ACTIVE"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** hash de la cookie anónima del invitado */
    guestKey: text("guest_key"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reservations_active_expiry_idx").on(t.expiresAt).where(sql`status = 'ACTIVE'`),
    check("reservation_has_owner", sql`${t.userId} IS NOT NULL OR ${t.guestKey} IS NOT NULL`),
  ],
);

/* ─────────────────────────── inventario ─────────────────────────── */

export const codeBatches = pgTable("code_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  source: text("source").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const codes = pgTable(
  "codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    status: codeStatus("status").notNull().default("AVAILABLE"),
    /** AES-256-GCM. El texto plano no toca disco ni logs. */
    secretCipher: bytea("secret_cipher").notNull(),
    secretNonce: bytea("secret_nonce").notNull(),
    secretTag: bytea("secret_tag").notNull(),
    /** HMAC-SHA256 con pimienta: deduplica sin permitir fuerza bruta. */
    secretFingerprint: bytea("secret_fingerprint").notNull().unique(),
    /** Puntero temporal: si vence, otro comprador se lo lleva. */
    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "set null",
    }),
    reservedUntil: timestamp("reserved_until", { withTimezone: true }),
    /** Puntero permanente: mientras no sea NULL, el barrido no lo toca. */
    orderItemId: uuid("order_item_id").references(() => orderItems.id, {
      onDelete: "restrict",
    }),
    batchId: uuid("batch_id").references(() => codeBatches.id, { onDelete: "set null" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Camino caliente del reclamo: solo filas libres.
    index("codes_claimable_idx")
      .on(t.productId, t.createdAt)
      .where(sql`status = 'AVAILABLE' AND order_item_id IS NULL`),
    // Reservas recuperables. El predicado excluye lo que ya tiene pedido.
    index("codes_reclaimable_idx")
      .on(t.reservedUntil)
      .where(sql`status = 'RESERVED' AND order_item_id IS NULL`),
    index("codes_order_item_idx").on(t.orderItemId),
    index("codes_reservation_idx").on(t.reservationId),

    check(
      "codes_reserved_has_deadline",
      sql`${t.status} <> 'RESERVED' OR ${t.reservedUntil} IS NOT NULL`,
    ),
    check(
      "codes_sold_has_item",
      sql`${t.status} NOT IN ('PAID','DELIVERED') OR ${t.orderItemId} IS NOT NULL`,
    ),
    check(
      "codes_available_is_clean",
      sql`${t.status} <> 'AVAILABLE' OR (${t.reservationId} IS NULL AND ${t.orderItemId} IS NULL AND ${t.reservedUntil} IS NULL)`,
    ),
  ],
);

/* ─────────────────────────── pagos y descuentos ─────────────────────────── */

export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: paymentProvider("provider").notNull(),
    providerRef: text("provider_ref"),
    status: text("status").notNull(),
    /** Monto canónico, siempre en COP — sale del pedido, nunca del cliente. */
    amountCop: bigint("amount_cop", { mode: "number" }).notNull(),
    /** Solo para PayPal: conversión del canónico al momento de iniciar el pago. */
    amountUsd: numeric("amount_usd", { precision: 10, scale: 2 }),
    currency: text("currency").notNull().default("COP"),
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Ancla de idempotencia para los webhooks que llegarán en la fase de pagos.
    uniqueIndex("payment_intents_provider_ref_key").on(t.provider, t.providerRef),
    index("payment_intents_order_idx").on(t.orderId),
    // Fase 5: un pedido no puede tener dos intentos activos a la vez — ver
    // 0004_payments.sql. Índice parcial, no representable con `.unique()`
    // simple de Drizzle, por eso vive acá como índice nombrado igual que en
    // el SQL que corre.
    uniqueIndex("payment_intents_active_per_order_idx")
      .on(t.orderId)
      .where(sql`status IN ('PENDING', 'INITIATED')`),
  ],
);

/**
 * Auditoría de CADA webhook de pago que toca el sistema, se acepte o no.
 * `paymentIntentId` nullable: un webhook huérfano (reference que no
 * matchea ningún intent nuestro) se registra igual, sin FK que resolver.
 */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    paymentIntentId: uuid("payment_intent_id").references(() => paymentIntents.id, {
      onDelete: "set null",
    }),
    provider: paymentProvider("provider").notNull(),
    /** Id de evento tal como lo manda el proveedor. Clave real de idempotencia. */
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    /** RECEIVED · VERIFIED · PROCESSED · DUPLICATE · REJECTED · ERROR */
    status: text("status").notNull().default("RECEIVED"),
    signatureValid: boolean("signature_valid"),
    payload: jsonb("payload").notNull(),
    errorMessage: text("error_message"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("payment_events_provider_event_key").on(t.provider, t.eventId),
    index("payment_events_intent_idx").on(t.paymentIntentId, t.receivedAt),
  ],
);

/**
 * Cola de reembolso asíncrono. Nace cuando un pago se confirma pero no hay
 * código para entregar (reserva expirada, agotado entre webhook y entrega).
 * Un worker (`npm run db:refund-worker`) la procesa con
 * `FOR UPDATE SKIP LOCKED` — ver `payment/refund-service.ts`.
 */
export const refundRequests = pgTable(
  "refund_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    paymentIntentId: uuid("payment_intent_id")
      .notNull()
      .references(() => paymentIntents.id, { onDelete: "restrict" }),
    provider: paymentProvider("provider").notNull(),
    /** PENDING_REFUND · REFUND_INITIATED · REFUND_COMPLETED · REFUND_FAILED · MANUAL_REVIEW_REQUIRED · CANCELLED */
    status: text("status").notNull().default("PENDING_REFUND"),
    reason: text("reason").notNull().default("CODES_UNAVAILABLE"),
    providerRef: text("provider_ref"),
    /**
     * Generado ANTES de llamar al proveedor y guardado siempre — el UNIQUE
     * de esta columna es la barrera real contra el doble reembolso, no la
     * ventana de idempotencia (limitada, distinta por proveedor) que Wompi
     * o PayPal puedan o no recordar del lado de ellos.
     */
    providerRequestId: text("provider_request_id").notNull(),
    amountCop: bigint("amount_cop", { mode: "number" }),
    amountUsd: numeric("amount_usd", { precision: 10, scale: 2 }),
    currency: text("currency").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    providerResponse: jsonb("provider_response"),
    errorMessage: text("error_message"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    webhookReceivedAt: timestamp("webhook_received_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("refund_requests_provider_request_key").on(t.providerRequestId),
    index("refund_requests_order_idx").on(t.orderId),
    // Camino caliente del worker — ver 0004_payments.sql.
    index("refund_requests_claim_idx")
      .on(t.status, t.requestedAt)
      .where(sql`status IN ('PENDING_REFUND', 'REFUND_INITIATED')`),
    check("refund_requests_amount_positive", sql`(${t.amountCop} IS NULL OR ${t.amountCop} > 0) AND (${t.amountUsd} IS NULL OR ${t.amountUsd} > 0)`),
    check("refund_requests_attempt_count_positive", sql`${t.attemptCount} >= 0`),
  ],
);

export const orderDiscounts = pgTable(
  "order_discounts",
  {
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id").references(() => discountRules.id, { onDelete: "set null" }),
    source: text("source").notNull(),
    /** Snapshot ya resuelto, p. ej. "Silver · 3%". */
    label: text("label").notNull(),
    amountCop: bigint("amount_cop", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.orderId, t.source, t.label] }),
    check("order_discounts_amount_positive", sql`${t.amountCop} >= 0`),
  ],
);

/* ─────────────────────────── soporte ─────────────────────────── */

/**
 * Ticket de soporte: puede nacer de un invitado (sin `user_id`) o de una
 * cuenta logueada. Acceso de invitado por `access_token_hash` — mismo
 * patrón que `orders.access_token_hash` (ver `tokens.ts`): el número de
 * ticket identifica, nunca autoriza.
 *
 * `order_id` es best-effort: se resuelve en el momento de crear el ticket
 * buscando `order_number_input` contra `orders`, pero se guarda igual el
 * texto crudo aunque no matchee (número mal escrito, pedido de otra
 * cuenta) — soporte lo ve de todas formas en el ticket.
 */
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketNumber: text("ticket_number").notNull().unique(),
    accessTokenHash: bytea("access_token_hash").notNull().unique(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    category: supportTicketCategory("category").notNull(),
    status: supportTicketStatus("status").notNull().default("OPEN"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    orderNumberInput: text("order_number_input"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    /** Presencia efímera para "escribiendo…" — se pisa en cada tecleo, se
        interpreta como activo solo si es reciente (ver support-service.ts). */
    customerTypingAt: timestamp("customer_typing_at", { withTimezone: true }),
    adminTypingAt: timestamp("admin_typing_at", { withTimezone: true }),
  },
  (t) => [
    index("support_tickets_status_idx").on(t.status, t.lastMessageAt),
    index("support_tickets_order_idx").on(t.orderId),
    index("support_tickets_user_idx").on(t.userId),
  ],
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    senderType: supportMessageSender("sender_type").notNull(),
    /** Quién lo escribió, si estaba logueado — el admin siempre lo está; el cliente, a veces. */
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("support_messages_ticket_idx").on(t.ticketId, t.createdAt)],
);

/* ─────────────────────────── seguridad ─────────────────────────── */

/**
 * `ip` es `text`, no `inet` — `getClientIp()` puede devolver "unknown"
 * cuando no hay proxy header, y eso rompería un tipo `inet`. Ver
 * 0011_ip_blocks.sql para el resto del razonamiento.
 */
export const ipBlocks = pgTable("ip_blocks", {
  ip: text("ip").primaryKey(),
  reason: text("reason").notNull(),
  blockedBy: uuid("blocked_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] }), index("rate_limit_counters_window_idx").on(t.windowStart)],
);

/* ─────────────────────────── auditoría ─────────────────────────── */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    actorType: text("actor_type").notNull(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** Nunca contiene el código en claro. */
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ip: inet("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId, t.occurredAt),
    index("audit_action_idx").on(t.action, t.occurredAt),
  ],
);

export const schema = {
  users,
  sessions,
  games,
  products,
  productImages,
  gameVisuals,
  loyaltyTiers,
  loyaltyCoupons,
  discountRules,
  orders,
  orderItems,
  reservations,
  codeBatches,
  codes,
  paymentIntents,
  paymentEvents,
  refundRequests,
  orderDiscounts,
  auditLogs,
  supportTickets,
  supportMessages,
  ipBlocks,
  rateLimitCounters,
};

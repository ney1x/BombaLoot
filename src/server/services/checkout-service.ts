import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import type { Db, TxDb } from "../db/client";
import { createDb, withTransaction } from "../db/client";
import { createOpaqueToken, generateOrderNumber, hashToken } from "../auth/tokens";
import type { AuditActor } from "./inventory";
import { attachCodesToOrderItem, createReservation, PAYMENT_WINDOW_SECONDS } from "./inventory";
import { attachLoyaltyCouponOrder, ensureLoyaltyCoupons, redeemLoyaltyCoupon, resolveLoyaltyTier } from "./loyalty";
import { redeemDiscountCode } from "./admin-discounts";
import { writeAudit } from "./audit";
import { checkRateLimit } from "./rate-limit";
import { assertIpNotBlocked } from "./security-service";
import { CHECKOUT_LIMITS } from "./checkout-limits";
import {
  EmptyCartError,
  InvalidProductError,
  InvalidQuantityError,
  LoyaltyCouponInvalidError,
  QuantityNotAllowedError,
} from "./errors";

/**
 * El backend real del flujo de compra.
 *
 * Regla que gobierna todo este archivo: el cliente manda `productId` +
 * `quantity`, nada más. Ningún precio, descuento, subtotal, total ni dato de
 * disponibilidad que venga del navegador se usa para nada — todo se vuelve a
 * calcular acá contra la base, dentro de la misma transacción que reserva el
 * inventario.
 */

/* ────────────────────────── tipos ────────────────────────── */

export type CheckoutOwner =
  | { type: "user"; userId: string; email: string; name: string | null; purchasesCount: number }
  | { type: "guest"; guestKey: string; email: string; name?: string | null };

export interface CheckoutLineInput {
  productId: string;
  quantity: number;
}

export interface CheckoutItemResult {
  productId: string;
  gameLabel: string;
  denomination: string;
  unit: string;
  quantity: number;
  unitPriceCop: number;
  lineTotalCop: number;
}

export interface CheckoutResult {
  orderId: string;
  orderNumber: string;
  /**
   * Solo viene con valor real la primera vez que se crea el pedido (o
   * cuando la respuesta idempotente se sirve desde la caché en memoria de
   * este mismo proceso, ver `idempotencyCache` más abajo). En un reintento
   * que cae fuera de esa caché, viene `null` — el hash ya está en la base,
   * pero el valor en claro nunca se guarda, así que no hay forma de
   * reconstruirlo. Ver el trade-off documentado al final del archivo.
   */
  accessToken: string | null;
  email: string;
  subtotalCop: number;
  discountCop: number;
  totalCop: number;
  discountLabel: string | null;
  paymentStatus: string;
  deliveryStatus: string;
  paymentExpiresAt: Date;
  items: CheckoutItemResult[];
  /** true si esta respuesta es un reintento idempotente, no una creación nueva. */
  idempotent: boolean;
}

/* ────────────────────────── caché de idempotencia (en memoria) ────────────────────────── */

/**
 * Igual que `rate-limit.ts`: vive en memoria del proceso. Sirve para el
 * Postgres local y para un contenedor Node persistente; en Vercel
 * serverless cada invocación es un proceso nuevo, así que esta caché no
 * sobrevive entre ellas — hace falta un store compartido (Redis) antes de
 * desplegar ahí si se quiere que el reintento SIEMPRE devuelva el token de
 * acceso en claro. Sin la caché, el reintento igual es seguro (nunca crea
 * un segundo pedido) — solo pierde la comodidad de repetir el token.
 */
const IDEMPOTENCY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const idempotencyCache = new Map<string, { result: CheckoutResult; expiresAt: number }>();

function cacheIdempotentResult(key: string, result: CheckoutResult): void {
  idempotencyCache.set(key, { result, expiresAt: Date.now() + IDEMPOTENCY_CACHE_TTL_MS });
}

function getCachedIdempotentResult(key: string): CheckoutResult | undefined {
  const entry = idempotencyCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    idempotencyCache.delete(key);
    return undefined;
  }
  return entry.result;
}

/** Solo para tests. */
export function resetIdempotencyCache(): void {
  idempotencyCache.clear();
}

/* ────────────────────────── helpers internos ────────────────────────── */

interface ProductRow {
  id: string;
  gameId: string;
  gameLabel: string;
  denomination: string;
  unit: string;
  priceCop: number;
  maxPerOrder: number;
}

/** De solo lectura — se usa dentro de la transacción del checkout (`TxDb`)
    y también, sin transacción, para la vista previa del cupón (`Db`). */
export async function lookupActiveProducts(db: Db | TxDb, productIds: string[]): Promise<Map<string, ProductRow>> {
  if (productIds.length === 0) return new Map();

  const { rows } = (await db.execute(sql`
    SELECT p.id, g.id AS game_id, g.label AS game_label, p.denomination, p.unit, p.price_cop, p.max_per_order
      FROM products p
      JOIN games g ON g.id = p.game_id
     WHERE p.id IN (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})
       AND p.is_active
       AND g.is_active
  `)) as unknown as {
    rows: Array<{
      id: string;
      game_id: string;
      game_label: string;
      denomination: string;
      unit: string;
      price_cop: number;
      max_per_order: number;
    }>;
  };

  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        gameId: r.game_id,
        gameLabel: r.game_label,
        denomination: r.denomination,
        unit: r.unit,
        priceCop: Number(r.price_cop),
        maxPerOrder: r.max_per_order,
      },
    ]),
  );
}

/**
 * Funde líneas repetidas del mismo producto sumando cantidades — evita
 * mandar dos filas con el mismo `product_id` a `order_items`
 * (`UNIQUE(order_id, product_id)`) y evita la ambigüedad de "qué línea vale"
 * si el cliente manda el mismo producto dos veces por error o a propósito.
 */
function mergeLines(lines: CheckoutLineInput[]): CheckoutLineInput[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
    merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);
  }
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

/**
 * Bug real, encontrado corriendo el test de doble clic: Drizzle no relanza
 * el error crudo de `pg` — lo envuelve en un `DrizzleQueryError` propio
 * ("Failed query: ...") y cuelga el original de `.cause`. `code` y
 * `constraint` viven ahí, no en el error de arriba. Revisar solo el error
 * de arriba hacía que esta función NUNCA detectara la colisión real, y la
 * carrera de idempotencia se colaba como un 500 sin manejar.
 */
function isIdempotencyKeyConflict(error: unknown): boolean {
  const withPgFields = (candidate: unknown): candidate is { code?: string; constraint?: string } =>
    typeof candidate === "object" && candidate !== null;

  for (const candidate of [error, (error as { cause?: unknown } | undefined)?.cause]) {
    if (withPgFields(candidate) && candidate.code === "23505" && candidate.constraint?.includes("idempotency")) {
      return true;
    }
  }
  return false;
}

async function findOrderRowByIdempotencyKey(
  db: Db,
  idempotencyKey: string,
): Promise<CheckoutResult | undefined> {
  const { rows } = (await db.execute(sql`
    SELECT id, order_number, email, subtotal_cop, discount_cop, total_cop,
           payment_status, delivery_status, payment_expires_at
      FROM orders
     WHERE idempotency_key = ${idempotencyKey}
  `)) as unknown as {
    rows: Array<{
      id: string;
      order_number: string;
      email: string;
      subtotal_cop: number;
      discount_cop: number;
      total_cop: number;
      payment_status: string;
      delivery_status: string;
      payment_expires_at: string;
    }>;
  };

  const row = rows[0];
  if (!row) return undefined;

  const { rows: itemRows } = (await db.execute(sql`
    SELECT product_id, game_label, denomination, unit, quantity, unit_price_cop, line_total_cop
      FROM order_items WHERE order_id = ${row.id}::uuid
  `)) as unknown as {
    rows: Array<{
      product_id: string;
      game_label: string;
      denomination: string;
      unit: string;
      quantity: number;
      unit_price_cop: number;
      line_total_cop: number;
    }>;
  };

  // `loyalty_tier_id` ya no implica descuento — queda seteado en TODO pedido
  // de un usuario logueado, sea o no que haya canjeado algo (ver
  // `checkoutCart`). La etiqueta real vive en `order_discounts`, la única
  // fuente de verdad de qué se descontó de verdad en este pedido puntual.
  const { rows: discountRows } = (await db.execute(
    sql`SELECT label FROM order_discounts WHERE order_id = ${row.id}::uuid LIMIT 1`,
  )) as unknown as { rows: Array<{ label: string }> };
  const discountLabel = discountRows[0]?.label ?? null;

  return {
    orderId: row.id,
    orderNumber: row.order_number,
    accessToken: null,
    email: row.email,
    subtotalCop: Number(row.subtotal_cop),
    discountCop: Number(row.discount_cop),
    totalCop: Number(row.total_cop),
    discountLabel,
    paymentStatus: row.payment_status,
    deliveryStatus: row.delivery_status,
    paymentExpiresAt: new Date(row.payment_expires_at),
    items: itemRows.map((i) => ({
      productId: i.product_id,
      gameLabel: i.game_label,
      denomination: i.denomination,
      unit: i.unit,
      quantity: i.quantity,
      unitPriceCop: Number(i.unit_price_cop),
      lineTotalCop: Number(i.line_total_cop),
    })),
    idempotent: true,
  };
}

interface InsertedOrderRow {
  id: string;
  order_number: string;
  payment_status: string;
  delivery_status: string;
  payment_expires_at: string;
}

function ownerAuditActor(owner: CheckoutOwner, ip?: string | null, userAgent?: string | null): AuditActor {
  return {
    type: "CUSTOMER",
    id: owner.type === "user" ? owner.userId : undefined,
    ip: ip ?? undefined,
    userAgent: userAgent ?? undefined,
  };
}

/* ────────────────────────── checkout ────────────────────────── */

export interface CheckoutParams {
  lines: CheckoutLineInput[];
  idempotencyKey: string;
  owner: CheckoutOwner;
  /** Código de cupón opcional, tal como lo escribió el comprador (se normaliza acá). */
  discountCode?: string;
  /** Cédula — solo viene con valor cuando el checkout la pidió (hoy: método Nequi), con consentimiento propio. */
  buyerLegalId?: string;
  /**
   * Cupón de fidelización opcional, de la cuenta del comprador — nunca
   * automático, es la elección activa de con qué pedido lo usa. Mutuamente
   * excluyente con `discountCode` (ver el guard más abajo): un pedido usa
   * como mucho un descuento.
   */
  loyaltyCouponId?: string;
  rateLimitKey?: string;
  ip?: string | null;
  userAgent?: string | null;
}

export async function checkoutCart(pool: Pool, params: CheckoutParams): Promise<CheckoutResult> {
  const { lines, idempotencyKey, owner, discountCode, loyaltyCouponId, buyerLegalId, rateLimitKey, ip, userAgent } =
    params;

  await assertIpNotBlocked(pool, ip, { userAgent, action: "checkout" });

  if (loyaltyCouponId && discountCode) {
    throw new LoyaltyCouponInvalidError("No podés usar un cupón de fidelización junto con un código de descuento.");
  }
  if (loyaltyCouponId && owner.type !== "user") {
    throw new LoyaltyCouponInvalidError("Iniciá sesión para usar un cupón de fidelización.");
  }

  if (!idempotencyKey || idempotencyKey.trim().length < 8) {
    throw new RangeError("idempotencyKey inválida");
  }
  if (lines.length === 0) throw new EmptyCartError();

  // Camino rápido de reintento (doble clic dentro del mismo proceso): ni
  // siquiera se abre transacción. La garantía de fondo (nunca dos pedidos)
  // no depende de este `if` — depende del UNIQUE de la columna, más abajo.
  const cached = getCachedIdempotentResult(idempotencyKey);
  // La entrada en caché guarda el resultado tal como se devolvió la primera
  // vez (con `idempotent: false`, porque en ese momento SÍ era la creación
  // real). Server la de nuevo debe reportar `idempotent: true` — es una
  // respuesta repetida, aunque el payload sea el mismo.
  if (cached) return { ...cached, idempotent: true };

  const db = createDb(pool);
  const existing = await findOrderRowByIdempotencyKey(db, idempotencyKey);
  if (existing) return existing;

  if (rateLimitKey) {
    await checkRateLimit(db, `checkout:${rateLimitKey}`, CHECKOUT_LIMITS.maxPerWindow, CHECKOUT_LIMITS.windowSeconds);
  }

  // Cantidades: Zod ya validó esto en el borde HTTP (ver checkout schema);
  // este es el segundo chequeo, contra llamadores que no pasen por HTTP
  // (tests, futuros jobs internos).
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50) {
      throw new InvalidQuantityError(line.productId, line.quantity);
    }
  }

  const merged = mergeLines(lines);
  const actor = ownerAuditActor(owner, ip, userAgent);

  let result: CheckoutResult;
  try {
    result = await withTransaction(pool, async (tx) => {
      const products = await lookupActiveProducts(
        tx,
        merged.map((l) => l.productId),
      );

      const priced = merged.map((line) => {
        const product = products.get(line.productId);
        if (!product) throw new InvalidProductError(line.productId);
        if (line.quantity > product.maxPerOrder) {
          throw new QuantityNotAllowedError(line.productId, line.quantity, product.maxPerOrder);
        }
        return { ...line, product };
      });

      const subtotalCop = priced.reduce((sum, l) => sum + l.product.priceCop * l.quantity, 0);

      // Ya no es un % automático de fondo — la fidelización solo entra al
      // total si el comprador eligió canjear un cupón suyo (más abajo).
      // `tier` se sigue resolviendo para dejarlo en `orders.loyalty_tier_id`
      // (reporting: en qué nivel estaba al comprar) y, sobre todo, para
      // reconciliar qué cupones le corresponden hasta ahora.
      const tier = owner.type === "user" ? await resolveLoyaltyTier(tx, owner.purchasesCount) : null;
      if (owner.type === "user") {
        await ensureLoyaltyCoupons(tx, owner.userId, owner.purchasesCount);
      }

      // Cupón opcional (código escrito o cupón de fidelización de la
      // cuenta) — vive en la misma transacción que el resto del checkout:
      // si algo más adelante falla (sin stock, reserva perdida), el
      // ROLLBACK deshace también el canje, así que un cupón nunca se
      // "gasta" en un pedido que no se creó. Son mutuamente excluyentes
      // (ver el guard al entrar a `checkoutCart`) — un pedido usa como
      // mucho un descuento, nunca los dos combinados.
      const redeemed = discountCode
        ? await redeemDiscountCode(tx, {
            code: discountCode,
            subtotalCop,
            lines: priced.map((l) => ({
              productId: l.productId,
              gameId: l.product.gameId,
              lineTotalCop: l.product.priceCop * l.quantity,
            })),
            buyerEmail: owner.email,
          })
        : null;

      const redeemedCoupon =
        loyaltyCouponId && owner.type === "user"
          ? await redeemLoyaltyCoupon(tx, { couponId: loyaltyCouponId, userId: owner.userId, subtotalCop })
          : null;

      const discountCop = redeemed?.amountCop ?? redeemedCoupon?.amountCop ?? 0;
      const totalCop = subtotalCop - discountCop;

      const reservationOwner =
        owner.type === "user" ? { userId: owner.userId } : { guestKey: owner.guestKey };

      // Misma reserva de 30 minutos que va a vivir en `orders.payment_expires_at`:
      // el checkout no pasa primero por la ventana corta de "navegando el
      // checkout" (esa ya ocurrió del lado del cliente, con datos mock, antes
      // de llegar acá) — el primer reclamo REAL contra la base es directamente
      // la ventana de pago.
      const reservation = await createReservation(tx, {
        owner: reservationOwner,
        lines: priced.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        ttlSeconds: PAYMENT_WINDOW_SECONDS,
        rateLimitKey,
        actor,
      });

      const orderNumber = generateOrderNumber();
      const { value: accessToken, hash: accessTokenHash } = createOpaqueToken();
      const buyerName = owner.type === "user" ? owner.name : (owner.name ?? null);
      const userId = owner.type === "user" ? owner.userId : null;

      let orderRow: InsertedOrderRow;
      try {
        const { rows } = (await tx.execute(sql`
          INSERT INTO orders (
            order_number, access_token_hash, user_id, email, buyer_name, buyer_legal_id,
            subtotal_cop, discount_cop, total_cop, currency,
            loyalty_tier_id, payment_expires_at, idempotency_key
          )
          VALUES (
            ${orderNumber}, ${accessTokenHash}, ${userId}::uuid, ${owner.email}, ${buyerName}, ${buyerLegalId ?? null},
            ${subtotalCop}, ${discountCop}, ${totalCop}, 'COP',
            ${tier?.id ?? null},
            now() + make_interval(secs => ${PAYMENT_WINDOW_SECONDS}::double precision),
            ${idempotencyKey}
          )
          RETURNING id, order_number, payment_status, delivery_status, payment_expires_at
        `)) as unknown as { rows: InsertedOrderRow[] };
        orderRow = rows[0];
      } catch (error) {
        if (isIdempotencyKeyConflict(error)) {
          throw new IdempotencyRaceMarker();
        }
        throw error;
      }

      // Cada fuente de descuento queda como su propia fila — nunca solo la
      // suma en `orders.discount_cop` — para poder auditar de dónde salió
      // cada peso descontado sin adivinar.
      if (redeemed) {
        await tx.execute(sql`
          INSERT INTO order_discounts (order_id, rule_id, source, label, amount_cop)
          VALUES (${orderRow.id}::uuid, ${redeemed.ruleId}::uuid, 'COUPON', ${redeemed.label}, ${redeemed.amountCop})
        `);
      }
      if (redeemedCoupon) {
        await tx.execute(sql`
          INSERT INTO order_discounts (order_id, rule_id, source, label, amount_cop)
          VALUES (${orderRow.id}::uuid, NULL, 'LOYALTY_COUPON', ${redeemedCoupon.label}, ${redeemedCoupon.amountCop})
        `);
        await attachLoyaltyCouponOrder(tx, redeemedCoupon.couponId, orderRow.id);
      }

      const items: CheckoutItemResult[] = [];
      for (const line of priced) {
        const lineTotalCop = line.product.priceCop * line.quantity;
        const { rows: itemRows } = (await tx.execute(sql`
          INSERT INTO order_items (
            order_id, product_id, game_label, denomination, unit, quantity, unit_price_cop, line_total_cop
          )
          VALUES (
            ${orderRow.id}::uuid, ${line.productId}, ${line.product.gameLabel}, ${line.product.denomination},
            ${line.product.unit}, ${line.quantity}, ${line.product.priceCop}, ${lineTotalCop}
          )
          RETURNING id
        `)) as unknown as { rows: Array<{ id: string }> };

        const orderItemId = itemRows[0].id;

        await attachCodesToOrderItem(tx, {
          reservationId: reservation.reservationId,
          productId: line.productId,
          orderItemId,
          quantity: line.quantity,
          paymentWindowSeconds: PAYMENT_WINDOW_SECONDS,
          actor,
        });

        items.push({
          productId: line.productId,
          gameLabel: line.product.gameLabel,
          denomination: line.product.denomination,
          unit: line.product.unit,
          quantity: line.quantity,
          unitPriceCop: line.product.priceCop,
          lineTotalCop,
        });
      }

      await tx.execute(sql`
        UPDATE reservations
           SET status = 'CONSUMED', consumed_at = now(), order_id = ${orderRow.id}::uuid
         WHERE id = ${reservation.reservationId}::uuid
      `);

      await writeAudit(tx, {
        actorType: actor.type,
        actorId: actor.id,
        action: "order.created",
        entityType: "order",
        entityId: orderRow.id,
        metadata: {
          itemCount: items.length,
          totalCop,
          guest: owner.type === "guest",
        },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });

      const discountLabel = redeemed?.label ?? redeemedCoupon?.label ?? null;

      return {
        orderId: orderRow.id,
        orderNumber: orderRow.order_number,
        accessToken,
        email: owner.email,
        subtotalCop,
        discountCop,
        totalCop,
        discountLabel,
        paymentStatus: orderRow.payment_status,
        deliveryStatus: orderRow.delivery_status,
        paymentExpiresAt: new Date(orderRow.payment_expires_at),
        items,
        idempotent: false,
      } satisfies CheckoutResult;
    });
  } catch (error) {
    if (error instanceof IdempotencyRaceMarker) {
      const raceLoserResult = await findOrderRowByIdempotencyKey(db, idempotencyKey);
      if (raceLoserResult) return raceLoserResult;
    }
    throw error;
  }

  cacheIdempotentResult(idempotencyKey, result);
  return result;
}

/**
 * Marcador interno: se lanza dentro de la transacción cuando el INSERT de
 * `orders` pierde la carrera de idempotencia contra una request gemela que
 * ya comiteó. Nunca sale de este archivo — `checkoutCart` lo atrapa y
 * responde con el pedido ganador.
 */
class IdempotencyRaceMarker extends Error {}

/* ────────────────────────── lectura de pedidos ────────────────────────── */

export interface OrderView {
  orderId: string;
  orderNumber: string;
  email: string;
  userId: string | null;
  subtotalCop: number;
  discountCop: number;
  totalCop: number;
  paymentStatus: string;
  deliveryStatus: string;
  /** Derivado, no una columna — ver `deriveOrderStatus`. */
  orderStatus: OrderStatus;
  paymentExpiresAt: Date | null;
  createdAt: Date;
  items: CheckoutItemResult[];
}

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_EXPIRED"
  | "PAID_PENDING_DELIVERY"
  | "PAID_AWAITING_REFUND"
  | "COMPLETED"
  | "FAILED"
  | "REFUNDED";

/**
 * "Estado del pedido" como concepto DERIVADO de `payment_status` +
 * `delivery_status` + `payment_expires_at`, nunca como una tercera columna
 * separada que pudiera desincronizarse de las otras dos. Es la misma lógica
 * que ya rige el resto del inventario: la verdad vive en pocos campos
 * primitivos, todo lo demás se calcula en el momento de leer.
 *
 * `PAYMENT_EXPIRED` en particular no depende de que un barrido haya
 * corrido: si `payment_status` sigue `PENDING` pero `payment_expires_at` ya
 * pasó, se reporta como vencido igual — mismo principio que
 * `codes_reclaimable` y `assertReservationActive`.
 *
 * `PAID_AWAITING_REFUND` (fase 5) — nunca "FAILED": el pago SÍ se
 * confirmó, lo que falta es la entrega (Caso B/G del diseño de pagos). Y
 * `REFUNDED` es su propio estado terminal, distinto de `FAILED`
 * (`FAILED` = nunca se cobró; `REFUNDED` = se cobró y se devolvió) — la
 * regla explícita del pedido es no decirle nunca al cliente que su pago
 * "falló" cuando en realidad se le devolvió el dinero.
 */
export function deriveOrderStatus(order: {
  paymentStatus: string;
  deliveryStatus: string;
  paymentExpiresAt: Date | null;
}): OrderStatus {
  if (order.paymentStatus === "REFUNDED") return "REFUNDED";
  if (order.paymentStatus === "FAILED") return "FAILED";
  if (order.paymentStatus === "PAID") {
    if (order.deliveryStatus === "DELIVERED") return "COMPLETED";
    if (order.deliveryStatus === "UNAVAILABLE") return "PAID_AWAITING_REFUND";
    return "PAID_PENDING_DELIVERY";
  }
  // PENDING desde acá.
  if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() < Date.now()) {
    return "PAYMENT_EXPIRED";
  }
  return "PENDING_PAYMENT";
}

interface OrderRow {
  id: string;
  order_number: string;
  email: string;
  user_id: string | null;
  subtotal_cop: number;
  discount_cop: number;
  total_cop: number;
  payment_status: string;
  delivery_status: string;
  payment_expires_at: string | null;
  created_at: string;
}

async function rowToOrderView(db: Db, row: OrderRow): Promise<OrderView> {
  const { rows: itemRows } = (await db.execute(sql`
    SELECT product_id, game_label, denomination, unit, quantity, unit_price_cop, line_total_cop
      FROM order_items WHERE order_id = ${row.id}::uuid
     ORDER BY game_label, denomination
  `)) as unknown as {
    rows: Array<{
      product_id: string;
      game_label: string;
      denomination: string;
      unit: string;
      quantity: number;
      unit_price_cop: number;
      line_total_cop: number;
    }>;
  };

  const paymentExpiresAt = row.payment_expires_at ? new Date(row.payment_expires_at) : null;

  return {
    orderId: row.id,
    orderNumber: row.order_number,
    email: row.email,
    userId: row.user_id,
    subtotalCop: Number(row.subtotal_cop),
    discountCop: Number(row.discount_cop),
    totalCop: Number(row.total_cop),
    paymentStatus: row.payment_status,
    deliveryStatus: row.delivery_status,
    orderStatus: deriveOrderStatus({
      paymentStatus: row.payment_status,
      deliveryStatus: row.delivery_status,
      paymentExpiresAt,
    }),
    paymentExpiresAt,
    createdAt: new Date(row.created_at),
    items: itemRows.map((i) => ({
      productId: i.product_id,
      gameLabel: i.game_label,
      denomination: i.denomination,
      unit: i.unit,
      quantity: i.quantity,
      unitPriceCop: Number(i.unit_price_cop),
      lineTotalCop: Number(i.line_total_cop),
    })),
  };
}

/**
 * Acceso de invitado (y, en los hechos, de cualquiera que tenga el link):
 * poseer el token opaco es la prueba de propiedad — el mismo mecanismo que
 * ya usa `claimGuestOrder` de la fase de auth. `order_number` NUNCA sirve
 * acá: solo se busca por el hash del token.
 */
export async function getOrderByAccessToken(pool: Pool, accessToken: string): Promise<OrderView | null> {
  const db = createDb(pool);
  const { rows } = (await db.execute(sql`
    SELECT id, order_number, email, user_id, subtotal_cop, discount_cop, total_cop,
           payment_status, delivery_status, payment_expires_at, created_at
      FROM orders
     WHERE access_token_hash = ${hashToken(accessToken)}
       AND access_token_revoked_at IS NULL
  `)) as unknown as { rows: OrderRow[] };

  const row = rows[0];
  if (!row) return null;
  return rowToOrderView(db, row);
}

/**
 * Acceso autenticado: exige que el pedido pertenezca al usuario de la
 * sesión. Devuelve `null` tanto si el pedido no existe como si existe pero
 * es de otra cuenta — el llamador (la ruta HTTP) responde 404 en los dos
 * casos, para no confirmarle a un atacante que el id es válido pero ajeno
 * (mismo criterio IDOR que `requireAdmin`).
 */
export async function getOrderForUser(pool: Pool, userId: string, orderId: string): Promise<OrderView | null> {
  const db = createDb(pool);
  const { rows } = (await db.execute(sql`
    SELECT id, order_number, email, user_id, subtotal_cop, discount_cop, total_cop,
           payment_status, delivery_status, payment_expires_at, created_at
      FROM orders
     WHERE id = ${orderId}::uuid
       AND user_id = ${userId}::uuid
  `)) as unknown as { rows: OrderRow[] };

  const row = rows[0];
  if (!row) return null;
  return rowToOrderView(db, row);
}

/**
 * Sin filtro de dueño — a propósito. Solo para llamadores que ya
 * verificaron el rol admin/support por su cuenta (`requireAdminOrSupportApi`
 * en la ruta), nunca expuesto directo a un `orderId` que mande el cliente
 * sin pasar por ese guard primero.
 */
export async function getOrderByIdAdmin(pool: Pool, orderId: string): Promise<OrderView | null> {
  const db = createDb(pool);
  const { rows } = (await db.execute(sql`
    SELECT id, order_number, email, user_id, subtotal_cop, discount_cop, total_cop,
           payment_status, delivery_status, payment_expires_at, created_at
      FROM orders
     WHERE id = ${orderId}::uuid
  `)) as unknown as { rows: OrderRow[] };

  const row = rows[0];
  if (!row) return null;
  return rowToOrderView(db, row);
}

/** Todos los pedidos del usuario logueado, para `/cuenta/pedidos`. */
export async function listOrdersForUser(pool: Pool, userId: string): Promise<OrderView[]> {
  const db = createDb(pool);
  const { rows } = (await db.execute(sql`
    SELECT id, order_number, email, user_id, subtotal_cop, discount_cop, total_cop,
           payment_status, delivery_status, payment_expires_at, created_at
      FROM orders
     WHERE user_id = ${userId}::uuid
     ORDER BY created_at DESC
  `)) as unknown as { rows: OrderRow[] };

  return Promise.all(rows.map((row) => rowToOrderView(db, row)));
}

/* ────────────────────────── mantenimiento ────────────────────────── */

/**
 * Barrido de pedidos PENDING cuya ventana de pago venció sin confirmarse.
 *
 * Sin esto, un carrito abandonado en el paso de pago deja sus códigos
 * `RESERVED` con `order_item_id` seteado — y por diseño (hallazgo A2 de la
 * auditoría), nada libera un código que ya tiene `order_item_id`. Eso es
 * correcto mientras el pago sigue en curso; es un problema si el comprador
 * nunca vuelve. Este barrido es lo que cierra ese círculo: mueve el pedido a
 * `payment_status='FAILED'` y libera los códigos de vuelta a `AVAILABLE`.
 *
 * Igual que `sweepExpiredReservations`, esto es mantenimiento — el estado
 * "vencido" ya se refleja al leer (`deriveOrderStatus`) sin que este job
 * corra. Lo que este job sí hace, y que la sola lectura no puede, es
 * devolver los códigos al inventario vendible.
 */
export async function sweepExpiredPendingOrders(
  pool: Pool,
): Promise<{ ordersExpired: number; codesReleased: number }> {
  return withTransaction(pool, async (tx) => {
    const { rows: expired } = (await tx.execute(sql`
      UPDATE orders
         SET payment_status = 'FAILED', updated_at = now()
       WHERE payment_status = 'PENDING'
         AND payment_expires_at IS NOT NULL
         AND payment_expires_at < now()
      RETURNING id
    `)) as unknown as { rows: Array<{ id: string }> };

    if (expired.length === 0) {
      return { ordersExpired: 0, codesReleased: 0 };
    }

    const orderIds = expired.map((r) => r.id);
    const { rowCount } = (await tx.execute(sql`
      UPDATE codes c
         SET status = 'AVAILABLE', reservation_id = NULL, reserved_until = NULL, order_item_id = NULL
        FROM order_items oi
       WHERE c.order_item_id = oi.id
         AND oi.order_id IN (${sql.join(orderIds.map((id) => sql`${id}::uuid`), sql`, `)})
         AND c.status = 'RESERVED'
    `)) as unknown as { rowCount: number | null };

    for (const id of orderIds) {
      await writeAudit(tx, {
        actorType: "SYSTEM",
        action: "order.failed",
        entityType: "order",
        entityId: id,
        metadata: { reason: "payment_window_expired" },
      });
    }

    return { ordersExpired: expired.length, codesReleased: rowCount ?? 0 };
  });
}

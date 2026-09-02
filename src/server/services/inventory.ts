import "server-only";

import { sql } from "drizzle-orm";
import type { Db, TxDb } from "../db/client";
import {
  InsufficientStockError,
  QuantityNotAllowedError,
  ReservationExpiredError,
} from "./errors";
import { RESERVATION_LIMITS } from "./reservation-limits";
import { checkRateLimit } from "./rate-limit";
import { writeAudit, type ActorType } from "./audit";

/**
 * Quién dispara la transición, para `audit_logs` (hallazgo M5). Por defecto
 * `SYSTEM` porque hoy nada llama a estas funciones desde una request HTTP con
 * un actor real todavía (fase 4). Nunca lleva el código en claro — solo ids,
 * cantidades y el propio `writeAudit` lo verifica dos veces (hallazgo C2).
 */
export interface AuditActor {
  type: ActorType;
  id?: string;
  ip?: string;
  userAgent?: string;
}

const SYSTEM_ACTOR: AuditActor = { type: "SYSTEM" };

/**
 * Inventario de códigos.
 *
 * Regla que gobierna todo este archivo: **el stock no se lee y después se
 * escribe**. Leer para decidir y escribir después deja una ventana donde dos
 * transacciones ven lo mismo, y ningún nivel de aislamiento la cierra sin
 * bloqueos explícitos. Acá la lectura y la escritura son la misma sentencia:
 * `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`, y la decisión
 * se toma sobre las filas efectivamente devueltas.
 *
 * Todas las funciones que escriben (`claimCodesForProduct`,
 * `createReservation`, `attachCodesToOrderItem`, `confirmOrderPayment`) piden
 * `TxDb`, no `Db`. `TxDb` solo lo produce `beginTransaction`/`withTransaction`
 * (ver `../db/client.ts`), así que llamarlas con el pool en autocommit
 * (`getDb()`) directamente no compila. Antes de esto compilaba, y una
 * reserva que reclamaba parte del stock y lanzaba `InsufficientStockError`
 * podía quedar comiteada sin rollback — hallazgo C1 de la auditoría.
 */

/** Ventana de reserva mientras el comprador está en el checkout. */
export const RESERVATION_TTL_SECONDS = 600; // 10 min

/** Ventana de pago una vez creado el pedido. Distinta y más larga. */
export const PAYMENT_WINDOW_SECONDS = 1800; // 30 min

/**
 * Predicado único de "código tomable". Lo comparten el reclamo y el conteo de
 * disponibilidad, así que lo que el catálogo muestra es exactamente lo que se
 * puede llegar a tomar.
 *
 * Incluye reservas vencidas a propósito: la recuperación ocurre dentro del
 * propio reclamo, así que **la corrección no depende de que el cron esté
 * vivo**. El barrido es mantenimiento, no un requisito.
 */
const CLAIMABLE = sql`
  order_item_id IS NULL
  AND ( status = 'AVAILABLE'
     OR (status = 'RESERVED' AND reserved_until < now()) )
`;

interface ExecResult {
  rows: Record<string, unknown>[];
  rowCount: number | null;
}

async function run(db: Db, query: ReturnType<typeof sql>): Promise<ExecResult> {
  const result = (await db.execute(query)) as unknown as ExecResult;
  return { rows: result.rows ?? [], rowCount: result.rowCount ?? null };
}

/* ────────────────────────── reclamo ────────────────────────── */

export interface ClaimParams {
  productId: string;
  quantity: number;
  reservationId: string;
  ttlSeconds?: number;
}

/**
 * Reclama `quantity` códigos de `productId` en una sola sentencia atómica.
 *
 * CONTRATO: `tx` debe venir de `beginTransaction`/`withTransaction`, que el
 * llamador revierte si esto lanza. Si lanza `InsufficientStockError` puede
 * haber tomado algunos códigos (menos de los pedidos) y solo el ROLLBACK los
 * devuelve. El tipo `TxDb` hace ese contrato parte de la firma, no solo de
 * este comentario — pasar `getDb()` acá no compila.
 */
export async function claimCodesForProduct(
  tx: TxDb,
  params: ClaimParams,
  actor: AuditActor = SYSTEM_ACTOR,
): Promise<string[]> {
  const { productId, quantity, reservationId, ttlSeconds = RESERVATION_TTL_SECONDS } = params;

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new RangeError(`quantity debe ser un entero >= 1, recibido ${quantity}`);
  }

  const { rows } = await run(
    tx,
    sql`
      WITH claimable AS (
        SELECT id
          FROM codes
         WHERE product_id = ${productId}
           AND ${CLAIMABLE}
         ORDER BY (status = 'AVAILABLE') DESC, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT ${quantity}
      )
      UPDATE codes c
         SET status         = 'RESERVED',
             reservation_id = ${reservationId}::uuid,
             reserved_until = now() + make_interval(secs => ${ttlSeconds}::double precision)
        FROM claimable
       WHERE c.id = claimable.id
      RETURNING c.id
    `,
  );

  const claimed = rows.map((row) => String(row.id));

  if (claimed.length < quantity) {
    throw new InsufficientStockError(productId, quantity, claimed.length);
  }

  // M5: se audita el éxito, no el intento — un ROLLBACK por stock insuficiente
  // deshace este INSERT junto con el resto, así que nunca queda un
  // "code.reserved" huérfano de una reserva que en realidad falló.
  await writeAudit(tx, {
    actorType: actor.type,
    actorId: actor.id,
    action: "code.reserved",
    entityType: "reservation",
    entityId: reservationId,
    metadata: { productId, quantity: claimed.length, codeIds: claimed },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  return claimed;
}

/* ────────────────────────── reserva ────────────────────────── */

export interface ReservationLine {
  productId: string;
  quantity: number;
}

export type ReservationOwner = { userId: string } | { guestKey: string };

export interface CreatedReservation {
  reservationId: string;
  expiresAt: Date;
  codesByProduct: Record<string, string[]>;
}

/**
 * Cuenta cuántas reservas ACTIVE tiene ya el dueño y lanza si llegó al tope.
 * Corre dentro de la misma transacción que va a crear la reserva nueva.
 */
async function assertOwnerBelowReservationLimit(
  tx: TxDb,
  owner: ReservationOwner,
): Promise<void> {
  const isGuest = "guestKey" in owner;
  const limit = isGuest
    ? RESERVATION_LIMITS.maxActivePerGuest
    : RESERVATION_LIMITS.maxActivePerUser;

  const ownerFilter = isGuest
    ? sql`guest_key = ${owner.guestKey}`
    : sql`user_id = ${owner.userId}::uuid`;

  const { rows } = await run(
    tx,
    sql`
      SELECT count(*)::int AS count
        FROM reservations
       WHERE ${ownerFilter}
         AND status = 'ACTIVE'
         AND expires_at > now()
    `,
  );

  const current = Number(rows[0]?.count ?? 0);
  if (current >= limit) {
    throw new QuantityNotAllowedError(
      isGuest ? "reservation:guest" : "reservation:user",
      current + 1,
      limit,
    );
  }
}

/**
 * Crea la reserva y toma todos sus códigos. Todo o nada: si falta stock de
 * cualquier línea, lanza y el ROLLBACK del llamador deja el inventario intacto.
 *
 * Hallazgo A3 de la auditoría — dos defensas, en capas distintas a propósito:
 *
 * 1. **Tope por dueño** (`assertOwnerBelowReservationLimit`, siempre activo):
 *    un `guest_key` o `userId` dado no puede tener más de
 *    `RESERVATION_LIMITS.maxActivePerGuest/User` reservas ACTIVE a la vez.
 *    Corre dentro de esta misma transacción, así que dos intentos
 *    simultáneos del mismo dueño no se cuelan los dos bajo el tope.
 *
 * 2. **Rate limit por `rateLimitKey`** (opcional, vía `checkRateLimit`): si el
 *    llamador pasa una clave estable del lado del cliente HTTP (IP, o IP+UA),
 *    se limita cuántas reservas puede *intentar crear* en la ventana de
 *    `RESERVATION_LIMITS.createWindowSeconds`. Esta es la que de verdad cierra
 *    el hueco de "guest_key arbitrario nuevo en cada intento": la defensa (1)
 *    sola no alcanza, porque nada impide que un atacante mande un `guestKey`
 *    distinto en cada request y nunca toque el tope por dueño.
 *
 * `rateLimitKey` es opcional porque hoy no existe la capa HTTP que lo puede
 * proveer (fase 4). Sin ese parámetro, la defensa (2) queda inactiva y solo
 * corre (1) — ver el trade-off documentado en el resumen de la auditoría.
 */
export async function createReservation(
  tx: TxDb,
  params: {
    owner: ReservationOwner;
    lines: ReservationLine[];
    ttlSeconds?: number;
    rateLimitKey?: string;
    actor?: AuditActor;
  },
): Promise<CreatedReservation> {
  const {
    owner,
    lines,
    ttlSeconds = RESERVATION_TTL_SECONDS,
    rateLimitKey,
    actor = SYSTEM_ACTOR,
  } = params;

  if (lines.length === 0) throw new RangeError("Una reserva necesita al menos una línea");

  if (rateLimitKey) {
    await checkRateLimit(
      tx,
      `reservation:create:${rateLimitKey}`,
      RESERVATION_LIMITS.createMaxPerWindow,
      RESERVATION_LIMITS.createWindowSeconds,
    );
  }

  await assertOwnerBelowReservationLimit(tx, owner);

  // Los límites por producto se validan contra la base, no contra el cliente.
  const { rows: limits } = await run(
    tx,
    sql`SELECT id, max_per_order FROM products
         WHERE id IN (${sql.join(lines.map((l) => sql`${l.productId}`), sql`, `)})
           AND is_active`,
  );
  const maxByProduct = new Map(limits.map((r) => [String(r.id), Number(r.max_per_order)]));

  for (const line of lines) {
    const max = maxByProduct.get(line.productId);
    if (max === undefined) {
      throw new InsufficientStockError(line.productId, line.quantity, 0);
    }
    if (line.quantity > max) {
      throw new QuantityNotAllowedError(line.productId, line.quantity, max);
    }
  }

  const userId = "userId" in owner ? owner.userId : null;
  const guestKey = "guestKey" in owner ? owner.guestKey : null;

  const { rows: created } = await run(
    tx,
    sql`
      INSERT INTO reservations (user_id, guest_key, expires_at)
      VALUES (
        ${userId}::uuid,
        ${guestKey},
        now() + make_interval(secs => ${ttlSeconds}::double precision)
      )
      RETURNING id, expires_at
    `,
  );

  const reservationId = String(created[0].id);
  const expiresAt = new Date(String(created[0].expires_at));
  const codesByProduct: Record<string, string[]> = {};

  for (const line of lines) {
    codesByProduct[line.productId] = await claimCodesForProduct(
      tx,
      {
        productId: line.productId,
        quantity: line.quantity,
        reservationId,
        ttlSeconds,
      },
      actor,
    );
  }

  return { reservationId, expiresAt, codesByProduct };
}

/** Libera una reserva viva. No toca códigos que ya pasaron a un pedido. */
export async function releaseReservation(
  tx: TxDb,
  reservationId: string,
  actor: AuditActor = SYSTEM_ACTOR,
): Promise<number> {
  const { rowCount } = await run(
    tx,
    sql`
      UPDATE codes
         SET status = 'AVAILABLE', reservation_id = NULL, reserved_until = NULL
       WHERE reservation_id = ${reservationId}::uuid
         AND order_item_id IS NULL
         AND status = 'RESERVED'
    `,
  );

  await run(
    tx,
    sql`UPDATE reservations SET status = 'CANCELLED'
         WHERE id = ${reservationId}::uuid AND status = 'ACTIVE'`,
  );

  if ((rowCount ?? 0) > 0) {
    await writeAudit(tx, {
      actorType: actor.type,
      actorId: actor.id,
      action: "code.released",
      entityType: "reservation",
      entityId: reservationId,
      metadata: { codesReleased: rowCount },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  }

  return rowCount ?? 0;
}

/** Verifica que la reserva siga viva. Uso suelto (fuera del paso reserva→pedido). */
export async function assertReservationActive(db: Db, reservationId: string): Promise<void> {
  const { rows } = await run(
    db,
    sql`SELECT 1 FROM reservations
         WHERE id = ${reservationId}::uuid AND status = 'ACTIVE' AND expires_at > now()`,
  );
  if (rows.length === 0) throw new ReservationExpiredError(reservationId);
}

/* ────────────────────────── reserva → pedido ────────────────────────── */

/**
 * Mueve los códigos del puntero temporal al permanente.
 *
 * Este es el punto exacto donde el código deja de ser recuperable: con
 * `order_item_id` distinto de NULL, ni el reclamo ni el barrido lo vuelven a
 * mirar. Es lo que evita que una reserva vencida libere un código cuyo pago ya
 * está en curso.
 *
 * Hallazgo A2 de la auditoría: antes de este fix, la validez de la reserva
 * (`status='ACTIVE'`, `expires_at > now()`) no se comprobaba acá — solo el
 * `WHERE` de `codes` (`status='RESERVED' AND order_item_id IS NULL`), que
 * sigue siendo cierto varios minutos después de que la UI ya declaró la
 * reserva vencida, porque nada la toca hasta que el barrido corre o alguien
 * más la reclama. Ahora la fila de `reservations` se bloquea con `FOR UPDATE`
 * y se valida **antes** de tocar `codes`, dentro de la misma transacción: una
 * reserva vencida no puede convertirse en pedido aunque el barrido no haya
 * pasado todavía. El `WHERE` de `codes` también suma `reserved_until > now()`
 * como segunda barrera redundante.
 */
export async function attachCodesToOrderItem(
  tx: TxDb,
  params: {
    reservationId: string;
    productId: string;
    orderItemId: string;
    quantity: number;
    paymentWindowSeconds?: number;
    actor?: AuditActor;
  },
): Promise<string[]> {
  const {
    reservationId,
    productId,
    orderItemId,
    quantity,
    paymentWindowSeconds = PAYMENT_WINDOW_SECONDS,
    actor = SYSTEM_ACTOR,
  } = params;

  const { rows: reservationRows } = await run(
    tx,
    sql`
      SELECT status, expires_at
        FROM reservations
       WHERE id = ${reservationId}::uuid
       FOR UPDATE
    `,
  );

  const reservation = reservationRows[0];
  const isActive =
    reservation !== undefined &&
    reservation.status === "ACTIVE" &&
    new Date(String(reservation.expires_at)).getTime() > Date.now();

  if (!isActive) {
    throw new ReservationExpiredError(reservationId);
  }

  const { rows } = await run(
    tx,
    sql`
      WITH picked AS (
        SELECT id
          FROM codes
         WHERE reservation_id = ${reservationId}::uuid
           AND product_id = ${productId}
           AND order_item_id IS NULL
           AND status = 'RESERVED'
           AND reserved_until > now()
         ORDER BY created_at
         FOR UPDATE
         LIMIT ${quantity}
      )
      UPDATE codes c
         SET order_item_id  = ${orderItemId}::uuid,
             reserved_until = now() + make_interval(secs => ${paymentWindowSeconds}::double precision)
        FROM picked
       WHERE c.id = picked.id
      RETURNING c.id
    `,
  );

  if (rows.length < quantity) {
    throw new InsufficientStockError(productId, quantity, rows.length);
  }

  const codeIds = rows.map((row) => String(row.id));

  await writeAudit(tx, {
    actorType: actor.type,
    actorId: actor.id,
    action: "code.assigned",
    entityType: "order_item",
    entityId: orderItemId,
    metadata: { productId, quantity: codeIds.length, codeIds, reservationId },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  return codeIds;
}

/**
 * Confirma el pago: mueve los códigos del pedido a `PAID` y el pedido mismo a
 * `payment_status='PAID'` / `delivery_status='DELIVERED'`, en una sola
 * llamada dentro de la transacción del que la invoca.
 *
 * Hallazgo M7: antes, quien confirmaba un pago podía actualizar `codes` (vía
 * `markOrderCodesPaid`) sin acordarse de actualizar `orders` en la misma
 * transacción — o hacerlo en otra distinta — dejando códigos `PAID` con un
 * pedido que sigue `PENDING`. Esta función junta ambas escrituras para que no
 * se puedan separar.
 */
export async function confirmOrderPayment(
  tx: TxDb,
  orderId: string,
  actor: AuditActor = SYSTEM_ACTOR,
): Promise<{ codesPaid: number }> {
  const { rowCount: codesPaid } = await run(
    tx,
    sql`
      UPDATE codes c
         SET status = 'PAID', reserved_until = NULL
        FROM order_items oi
       WHERE c.order_item_id = oi.id
         AND oi.order_id = ${orderId}::uuid
         AND c.status = 'RESERVED'
    `,
  );

  await run(
    tx,
    sql`
      UPDATE orders
         SET payment_status  = 'PAID',
             delivery_status = 'DELIVERED',
             paid_at         = now(),
             delivered_at    = now(),
             updated_at      = now()
       WHERE id = ${orderId}::uuid
    `,
  );

  await writeAudit(tx, {
    actorType: actor.type,
    actorId: actor.id,
    action: "order.paid",
    entityType: "order",
    entityId: orderId,
    metadata: { codesPaid: codesPaid ?? 0 },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  return { codesPaid: codesPaid ?? 0 };
}

/**
 * @deprecated usar `confirmOrderPayment`, que también actualiza `orders` en
 * la misma transacción (hallazgo M7). Se mantiene solo porque los tests de
 * concurrencia de la fase 2 la llaman directo para aislar el comportamiento
 * de `codes` sin depender de que exista un `orders` completo alrededor.
 */
export async function markOrderCodesPaid(tx: TxDb, orderId: string): Promise<number> {
  const { rowCount } = await run(
    tx,
    sql`
      UPDATE codes c
         SET status = 'PAID', reserved_until = NULL
        FROM order_items oi
       WHERE c.order_item_id = oi.id
         AND oi.order_id = ${orderId}::uuid
         AND c.status = 'RESERVED'
    `,
  );
  return rowCount ?? 0;
}

/* ────────────────────────── lectura ────────────────────────── */

/**
 * Disponibilidad por producto, con el mismo predicado que el reclamo.
 * Es un dato de presentación: se puede cachear unos segundos. Lo que nunca se
 * cachea es la decisión de reservar.
 */
export async function getAvailability(
  db: Db,
  productIds?: string[],
): Promise<Map<string, number>> {
  const filter =
    productIds && productIds.length > 0
      ? sql`AND p.id IN (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})`
      : sql``;

  const { rows } = await run(
    db,
    sql`
      SELECT p.id, count(c.id)::int AS available
        FROM products p
        LEFT JOIN codes c
          ON c.product_id = p.id
         AND ${CLAIMABLE}
       WHERE p.is_active ${filter}
       GROUP BY p.id
    `,
  );

  return new Map(rows.map((row) => [String(row.id), Number(row.available)]));
}

/* ────────────────────────── mantenimiento ────────────────────────── */

/**
 * Barrido de reservas vencidas.
 *
 * NO es requisito de corrección: el reclamo ya recupera reservas vencidas por
 * su cuenta, y `attachCodesToOrderItem` ahora valida la reserva en el momento
 * (hallazgo A2). Si este job se cae una semana, el stock se sigue vendiendo
 * bien y nadie compra con una reserva vencida. Sirve para mantener los
 * índices parciales limpios y para que el conteo del catálogo no dependa de
 * evaluar `reserved_until < now()` en cada consulta.
 */
export async function sweepExpiredReservations(
  db: Db,
): Promise<{ codesReleased: number; reservationsExpired: number }> {
  const codes = await run(
    db,
    sql`
      UPDATE codes
         SET status = 'AVAILABLE', reservation_id = NULL, reserved_until = NULL
       WHERE status = 'RESERVED'
         AND order_item_id IS NULL
         AND reserved_until < now()
    `,
  );

  const reservations = await run(
    db,
    sql`
      UPDATE reservations
         SET status = 'EXPIRED'
       WHERE status = 'ACTIVE' AND expires_at < now()
    `,
  );

  return {
    codesReleased: codes.rowCount ?? 0,
    reservationsExpired: reservations.rowCount ?? 0,
  };
}

import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { withTransaction, type Db, type TxDb } from "../db/client";
import { LoyaltyCouponInvalidError } from "./errors";

/**
 * Nivel de fidelización resuelto desde `loyalty_tiers` — nunca desde el
 * cliente. Los niveles y sus porcentajes siguen siendo datos configurables
 * (la tabla, no una constante en código), tal como se aprobó en la fase de
 * arquitectura.
 */
export interface ResolvedTier {
  id: string;
  name: string;
  discountPct: number;
}

/**
 * El nivel más alto cuyo `min_purchases` no supera las compras del
 * comprador. Un invitado (sin `purchasesCount`) no tiene nivel — el
 * checkout ya lo maneja pasando `null` para invitados, nunca llamando a
 * esto con un número inventado.
 */
export async function resolveLoyaltyTier(db: Db, purchasesCount: number): Promise<ResolvedTier | null> {
  const { rows } = (await db.execute(sql`
    SELECT id, name, discount_pct
      FROM loyalty_tiers
     WHERE is_active
       AND min_purchases <= ${purchasesCount}
     ORDER BY min_purchases DESC
     LIMIT 1
  `)) as unknown as { rows: Array<{ id: string; name: string; discount_pct: string }> };

  const row = rows[0];
  if (!row) return null;

  return { id: row.id, name: row.name, discountPct: Number(row.discount_pct) };
}

export interface LoyaltyCoupon {
  id: string;
  tierId: string;
  tierName: string;
  discountPct: number;
  reason: "TIER_REACHED" | "REPEAT_INTERVAL";
  grantedAt: string;
  redeemedAt: string | null;
}

interface CouponRow {
  id: string;
  tier_id: string;
  tier_name: string;
  discount_pct: string;
  reason: "TIER_REACHED" | "REPEAT_INTERVAL";
  granted_at: string;
  redeemed_at: string | null;
}

function toCoupon(row: CouponRow): LoyaltyCoupon {
  return {
    id: row.id,
    tierId: row.tier_id,
    tierName: row.tier_name,
    discountPct: Number(row.discount_pct),
    reason: row.reason,
    grantedAt: row.granted_at,
    redeemedAt: row.redeemed_at,
  };
}

/**
 * Se llama antes de mostrar u ofrecer cupones (cuenta, checkout) — nunca
 * hay un job/cron que "otorgue" cupones por su cuenta: se reconcilia contra
 * `purchases_count` en el momento que hace falta, igual que
 * `resolveLoyaltyTier` resuelve el nivel al vuelo en vez de guardarlo
 * cacheado en el usuario. Idempotente por el índice único
 * `loyalty_coupons_milestone_key` — `ON CONFLICT DO NOTHING` es la
 * garantía real, no una lectura previa.
 *
 * Un cupón por (usuario, nivel) al cruzar cada `min_purchases` con
 * descuento > 0 ("TIER_REACHED"). Además, mientras el usuario esté en el
 * nivel activo más alto y ese nivel tenga `repeat_every_purchases`, un
 * cupón más por cada múltiplo de esa cantidad por encima del umbral
 * ("REPEAT_INTERVAL") — así alguien que ya llegó al tope no deja de ganar
 * el beneficio solo por no haber otro nivel arriba.
 */
export async function ensureLoyaltyCoupons(tx: TxDb, userId: string, purchasesCount: number): Promise<void> {
  const { rows: tiers } = (await tx.execute(sql`
    SELECT id, name, discount_pct, min_purchases, repeat_every_purchases
      FROM loyalty_tiers
     WHERE is_active
     ORDER BY min_purchases ASC
  `)) as unknown as {
    rows: Array<{
      id: string;
      name: string;
      discount_pct: string;
      min_purchases: number;
      repeat_every_purchases: number | null;
    }>;
  };

  const reached = tiers.filter((t) => t.min_purchases <= purchasesCount && Number(t.discount_pct) > 0);
  if (reached.length === 0) return;

  for (const tier of reached) {
    await tx.execute(sql`
      INSERT INTO loyalty_coupons (user_id, tier_id, tier_name, discount_pct, reason, milestone_purchases)
      VALUES (${userId}::uuid, ${tier.id}, ${tier.name}, ${tier.discount_pct}, 'TIER_REACHED', ${tier.min_purchases})
      ON CONFLICT DO NOTHING
    `);
  }

  const topTier = reached[reached.length - 1];
  if (topTier.repeat_every_purchases) {
    const milestonesReached = Math.floor((purchasesCount - topTier.min_purchases) / topTier.repeat_every_purchases);
    for (let k = 1; k <= milestonesReached; k++) {
      const milestone = topTier.min_purchases + k * topTier.repeat_every_purchases;
      await tx.execute(sql`
        INSERT INTO loyalty_coupons (user_id, tier_id, tier_name, discount_pct, reason, milestone_purchases)
        VALUES (${userId}::uuid, ${topTier.id}, ${topTier.name}, ${topTier.discount_pct}, 'REPEAT_INTERVAL', ${milestone})
        ON CONFLICT DO NOTHING
      `);
    }
  }
}

/** Cuenta y checkout: qué tiene disponible (y, para la cuenta, su historial ya canjeado). */
export async function listUserLoyaltyCoupons(
  db: Db,
  userId: string,
): Promise<{ available: LoyaltyCoupon[]; redeemed: LoyaltyCoupon[] }> {
  const { rows } = (await db.execute(sql`
    SELECT id, tier_id, tier_name, discount_pct, reason, granted_at, redeemed_at
      FROM loyalty_coupons
     WHERE user_id = ${userId}::uuid
     ORDER BY granted_at DESC
  `)) as unknown as { rows: CouponRow[] };

  const all = rows.map(toCoupon);
  return {
    available: all.filter((c) => !c.redeemedAt),
    redeemed: all.filter((c) => c.redeemedAt),
  };
}

export interface RedeemedLoyaltyCoupon {
  couponId: string;
  label: string;
  amountCop: number;
}

/**
 * Bloquea y canjea el cupón — misma forma que `redeemDiscountCode`
 * (`FOR UPDATE` + `UPDATE ... WHERE redeemed_at IS NULL`, nunca
 * SELECT-then-UPDATE) para que dos intentos de canje simultáneos contra el
 * mismo cupón (doble clic, dos pestañas) nunca lo gasten dos veces. Vive en
 * la misma transacción que `checkoutCart`: si el pedido no llega a crearse
 * (sin stock, reserva perdida), el ROLLBACK también deshace el canje.
 *
 * `redeemed_order_id` se completa después, con `attachLoyaltyCouponOrder`,
 * una vez que el pedido ya tiene fila propia — mismo criterio que
 * `reservations.order_id` en checkout-service.ts.
 */
export async function redeemLoyaltyCoupon(
  tx: TxDb,
  params: { couponId: string; userId: string; subtotalCop: number },
): Promise<RedeemedLoyaltyCoupon> {
  const { rows } = (await tx.execute(sql`
    SELECT id, tier_name, discount_pct
      FROM loyalty_coupons
     WHERE id = ${params.couponId}::uuid
       AND user_id = ${params.userId}::uuid
       AND redeemed_at IS NULL
     FOR UPDATE
  `)) as unknown as { rows: Array<{ id: string; tier_name: string; discount_pct: string }> };

  const coupon = rows[0];
  if (!coupon) {
    throw new LoyaltyCouponInvalidError("Ese cupón de fidelización ya no está disponible.");
  }

  const { rowCount } = (await tx.execute(sql`
    UPDATE loyalty_coupons SET redeemed_at = now()
     WHERE id = ${coupon.id}::uuid AND redeemed_at IS NULL
  `)) as unknown as { rowCount: number | null };

  if (!rowCount) {
    throw new LoyaltyCouponInvalidError("Ese cupón de fidelización ya no está disponible.");
  }

  const pct = Number(coupon.discount_pct);
  const amountCop = Math.round((params.subtotalCop * pct) / 100);

  return { couponId: coupon.id, label: `${coupon.tier_name} · ${pct}% (cupón de fidelización)`, amountCop };
}

export async function attachLoyaltyCouponOrder(tx: TxDb, couponId: string, orderId: string): Promise<void> {
  await tx.execute(sql`
    UPDATE loyalty_coupons SET redeemed_order_id = ${orderId}::uuid WHERE id = ${couponId}::uuid
  `);
}

/**
 * Reconcilia y devuelve en un solo paso — lo que usan tanto la cuenta como
 * el checkout para mostrar "esto es lo que tenés disponible ahora mismo",
 * sin que cada caller tenga que acordarse de llamar `ensureLoyaltyCoupons`
 * antes de leer.
 */
export async function getAccountLoyaltyCoupons(
  pool: Pool,
  userId: string,
  purchasesCount: number,
): Promise<{ available: LoyaltyCoupon[]; redeemed: LoyaltyCoupon[] }> {
  return withTransaction(pool, async (tx) => {
    await ensureLoyaltyCoupons(tx, userId, purchasesCount);
    return listUserLoyaltyCoupons(tx, userId);
  });
}

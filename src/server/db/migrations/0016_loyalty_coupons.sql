-- ════════════════════════════════════════════════════════════════════
-- Fidelización como cupón de un solo uso, no como % automático de fondo.
--
-- Antes, el nivel de fidelización descontaba solo por existir (checkout-
-- service.ts lo sumaba a todo pedido, sin que el cliente eligiera nada).
-- Ahora cada vez que el cliente cruza el umbral de un nivel gana UN cupón
-- de un solo uso, propio de su cuenta, que decide cuándo canjear. Al
-- quedarse en el nivel más alto activo, sigue ganando un cupón más cada
-- `repeat_every_purchases` compras (columna nueva en loyalty_tiers) — así
-- no deja de recibir el beneficio solo por no haber otro nivel arriba.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE loyalty_tiers
  ADD COLUMN repeat_every_purchases integer,
  ADD CONSTRAINT loyalty_repeat_every_purchases_positive
    CHECK (repeat_every_purchases IS NULL OR repeat_every_purchases > 0);

CREATE TYPE loyalty_coupon_reason AS ENUM ('TIER_REACHED', 'REPEAT_INTERVAL');

CREATE TABLE loyalty_coupons (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_id             text NOT NULL REFERENCES loyalty_tiers(id),
  -- Snapshot al otorgarlo: si el admin después renombra el nivel o le
  -- cambia el %, un cupón que ya está en la cuenta del cliente no cambia.
  tier_name           text NOT NULL,
  discount_pct        numeric(5, 2) NOT NULL,
  reason              loyalty_coupon_reason NOT NULL,
  -- El purchases_count exacto que ganó este cupón — clave de dedupe si
  -- ensureLoyaltyCoupons corre dos veces para el mismo hito (misma
  -- garantía que idempotency_key en orders, vía constraint única).
  milestone_purchases integer NOT NULL,
  granted_at          timestamptz NOT NULL DEFAULT now(),
  redeemed_at         timestamptz,
  redeemed_order_id   uuid REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT loyalty_coupons_discount_range CHECK (discount_pct > 0 AND discount_pct <= 100)
);

CREATE UNIQUE INDEX loyalty_coupons_milestone_key
  ON loyalty_coupons (user_id, tier_id, reason, milestone_purchases);

-- El listado de "cupones disponibles" (cuenta + checkout) siempre filtra
-- por esto — índice parcial, no uno completo por user_id.
CREATE INDEX loyalty_coupons_user_available_idx
  ON loyalty_coupons (user_id) WHERE redeemed_at IS NULL;

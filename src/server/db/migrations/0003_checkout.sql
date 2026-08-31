-- ════════════════════════════════════════════════════════════════════
-- Fase 4 — backend real del flujo de compra.
--
-- Un solo cambio de esquema: la clave de idempotencia del checkout. Todo lo
-- demás (orders, order_items, reservations, codes, loyalty_tiers) ya existía
-- desde 0000_init.sql — esta fase conecta el flujo real sobre esas tablas,
-- no las rediseña.
-- ════════════════════════════════════════════════════════════════════

-- Clave de idempotencia del checkout (hallazgo de diseño #6 del pedido).
--
-- El cliente genera un UUID una vez por intento de checkout (al entrar a
-- /checkout) y lo manda en cada POST /api/checkout, incluidos los reintentos
-- por doble clic o timeout. Con `UNIQUE`, un segundo INSERT con la misma
-- clave falla por violación de constraint — el servicio la atrapa y
-- devuelve el pedido que ya existe en vez de crear uno nuevo. Nullable
-- porque no todo `orders` nace de este flujo (los tests de fases previas
-- insertan pedidos sin idempotency_key).
ALTER TABLE orders ADD COLUMN idempotency_key text UNIQUE;

-- Camino caliente del barrido de pedidos abandonados (ver
-- `sweepExpiredPendingOrders` en inventory.ts): pedidos PENDING cuya ventana
-- de pago venció. Índice parcial, igual que `codes_reclaimable_idx`.
CREATE INDEX orders_pending_expiry_idx ON orders (payment_expires_at)
  WHERE payment_status = 'PENDING';

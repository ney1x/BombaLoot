-- ════════════════════════════════════════════════════════════════════
-- Celular de Nequi como columna propia de `orders`.
--
-- Hasta ahora solo vivía adentro de `payment_intents.raw_payload` (el JSON
-- crudo que Wompi devuelve al crear la transacción) — nada lo consultaba
-- ni lo mostraba en ningún lado. `initWompiNequiPayment` lo completa en el
-- momento en que arma el pago (no antes: recién ahí se conoce).
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE orders ADD COLUMN buyer_phone text;

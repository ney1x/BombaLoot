-- ════════════════════════════════════════════════════════════════════
-- Comisión por transacción — para poder mostrar el neto real (no solo el
-- bruto) por admin y por método de pago.
--
-- PayPal SÍ devuelve la comisión exacta en la respuesta de captura
-- (`seller_receivable_breakdown.paypal_fee`) — eso se guarda tal cual,
-- `fee_is_estimated = false`.
--
-- Wompi NO devuelve la comisión por API — solo aparece en sus reportes de
-- liquidación, fuera de este sistema. `payment_fee_settings` (singleton,
-- mismo patrón que `code_lifecycle_settings`, 0023) guarda la tarifa
-- pactada para poder ESTIMARLA en el momento de aprobar el pago
-- (`fee_is_estimated = true`) — valores default = Plan Avanzado publicado
-- por Wompi (2.65% + $700 COP + IVA 19% sobre la comisión), editable desde
-- el admin si el plan real es otro.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE payment_fee_settings (
  id                  boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- Puntos básicos (1/100 de 1%) — evita floats para algo que se multiplica
  -- por montos en centavos/pesos. 265 = 2.65%.
  wompi_percentage_bp integer NOT NULL DEFAULT 265,
  wompi_fixed_cop     integer NOT NULL DEFAULT 700,
  wompi_iva_bp        integer NOT NULL DEFAULT 1900,
  updated_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (wompi_percentage_bp >= 0 AND wompi_fixed_cop >= 0 AND wompi_iva_bp >= 0)
);

INSERT INTO payment_fee_settings (id) VALUES (true);

ALTER TABLE payment_intents
  ADD COLUMN fee_cop numeric,
  ADD COLUMN fee_usd numeric,
  ADD COLUMN fee_is_estimated boolean NOT NULL DEFAULT false;

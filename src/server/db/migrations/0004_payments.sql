-- ════════════════════════════════════════════════════════════════════
-- Fase 5 — integración de pagos (Wompi/PayPal), webhooks y reembolsos.
--
-- `payment_intents` ya existía desde 0000_init.sql (pensada para esto desde
-- el principio). Esta migración agrega lo que le faltaba al circuito:
--   1. Un candado de concurrencia sobre `payment_intents` para que dos
--      clics en "pagar" del mismo pedido no puedan crear dos intentos
--      activos a la vez — sin caché en memoria, sin idempotency_store
--      genérico: un índice único parcial alcanza.
--   2. `payment_events`, el registro de CADA intento de webhook (recibido,
--      firma válida/inválida, procesado, duplicado, rechazado, error) —
--      nunca solo el que se aceptó.
--   3. `refund_requests`, la cola del reembolso asíncrono: nace cuando un
--      pago se confirma pero no hay código para entregar, y un worker
--      (`npm run db:refund-worker`) la procesa con
--      `FOR UPDATE SKIP LOCKED` para poder correr con varias instancias
--      a la vez sin pisarse.
--   4. Tres columnas nuevas en `orders` para mostrar en la UI por qué un
--      pago quedó como quedó, sin tener que joinear contra payment_intents
--      para lo más común.
-- ════════════════════════════════════════════════════════════════════

/* ─────────────────────────── candado de payment_intents ─────────────────────────── */

-- Un pedido puede tener varios payment_intents a lo largo del tiempo (pagó
-- con Wompi, lo rechazaron, reintentó con PayPal) — lo que nunca puede tener
-- son DOS activos (PENDING/INITIATED) al mismo tiempo. Esto es lo que hace
-- que POST /api/payments/[provider]/init sea seguro ante doble clic sin
-- caché en memoria: el segundo INSERT choca contra este índice, el servicio
-- atrapa la violación y devuelve el intento que ya está en curso.
CREATE UNIQUE INDEX payment_intents_active_per_order_idx ON payment_intents (order_id)
  WHERE status IN ('PENDING', 'INITIATED');

-- `amount_cop` (ya existente) sigue siendo el monto canónico: sale del
-- pedido, nunca del cliente. Para PayPal, el monto que efectivamente se le
-- pide al proveedor es una conversión a USD de ese canónico — se guarda acá
-- para que la tolerancia del webhook (§ USD ±0.01) tenga contra qué comparar
-- sin recalcular la conversión en cada verificación.
ALTER TABLE payment_intents ADD COLUMN amount_usd numeric(10, 2);

-- Falta en el diseño original de 0000_init.sql: sin esta columna, el
-- webhook no tiene contra qué comparar la moneda que reporta el proveedor
-- (§ Seguridad — manipulación de currency). 'COP' de default porque todo
-- payment_intent existente hasta ahora (ninguno, en la práctica) sería de
-- Wompi.
ALTER TABLE payment_intents ADD COLUMN currency text NOT NULL DEFAULT 'COP';

-- Para el caso "webhook perdido": `GET /api/result` solo sincroniza contra
-- el proveedor cuando el intent lleva un rato sin cambiar de estado — sin
-- esta columna no hay forma de distinguir "recién creado" de "atascado".
ALTER TABLE payment_intents ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

/* ─────────────────────────── payment_events ─────────────────────────── */

-- Auditoría completa de CADA webhook que toca el sistema, se acepte o no.
-- `payment_intent_id` es nullable a propósito: un webhook cuyo `reference`
-- no matchea ningún intent nuestro (huérfano, o un ataque) igual se
-- registra, para poder investigarlo — simplemente sin FK que resolver.
CREATE TABLE payment_events (
  id                bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  payment_intent_id uuid REFERENCES payment_intents(id) ON DELETE SET NULL,
  provider          payment_provider NOT NULL,
  -- Id de evento tal como lo manda el proveedor (transaction.id de Wompi,
  -- webhook.id de PayPal). Es la clave de idempotencia real: dos entregas
  -- del mismo evento (reintento de red, reenvío del proveedor) truncan acá.
  event_id          text NOT NULL,
  event_type        text NOT NULL,
  -- RECEIVED · VERIFIED · PROCESSED · DUPLICATE · REJECTED · ERROR
  status            text NOT NULL DEFAULT 'RECEIVED',
  signature_valid   boolean,
  payload           jsonb NOT NULL,
  error_message     text,
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz,
  CONSTRAINT payment_events_provider_event_key UNIQUE (provider, event_id)
);

CREATE INDEX payment_events_intent_idx ON payment_events (payment_intent_id, received_at);

/* ─────────────────────────── refund_requests ─────────────────────────── */

CREATE TABLE refund_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_intent_id   uuid NOT NULL REFERENCES payment_intents(id) ON DELETE RESTRICT,
  provider            payment_provider NOT NULL,
  -- PENDING_REFUND · REFUND_INITIATED · REFUND_COMPLETED · REFUND_FAILED ·
  -- MANUAL_REVIEW_REQUIRED · CANCELLED (códigos recuperados antes de reembolsar)
  status              text NOT NULL DEFAULT 'PENDING_REFUND',
  -- Fase 5 solo conoce un motivo: pago confirmado sin código que entregar.
  -- Columna explícita igual, para no tener que adivinar leyendo metadata.
  reason              text NOT NULL DEFAULT 'CODES_UNAVAILABLE',
  provider_ref        text,
  -- Generado ANTES de llamar al proveedor y guardado siempre, sin asumir
  -- que Wompi/PayPal recuerdan la idempotencia más allá de su propia
  -- ventana (24h Wompi, sin garantía documentada en PayPal): el UNIQUE de
  -- esta columna es la barrera real contra el doble reembolso, no la del
  -- proveedor.
  provider_request_id text NOT NULL,
  amount_cop          bigint,
  amount_usd          numeric(10, 2),
  currency            text NOT NULL,
  attempt_count       integer NOT NULL DEFAULT 0,
  provider_response   jsonb,
  error_message       text,
  requested_at        timestamptz NOT NULL DEFAULT now(),
  initiated_at        timestamptz,
  completed_at        timestamptz,
  webhook_received_at timestamptz,
  CONSTRAINT refund_requests_provider_request_key UNIQUE (provider_request_id),
  CONSTRAINT refund_requests_amount_positive CHECK (
    (amount_cop IS NULL OR amount_cop > 0) AND (amount_usd IS NULL OR amount_usd > 0)
  ),
  CONSTRAINT refund_requests_attempt_count_positive CHECK (attempt_count >= 0)
);

CREATE INDEX refund_requests_order_idx ON refund_requests (order_id);

-- Camino caliente del worker: solo las filas que todavía puede tomar.
-- `FOR UPDATE SKIP LOCKED` sobre este índice es lo que permite correr el
-- worker en varias instancias sin coordinación externa.
CREATE INDEX refund_requests_claim_idx ON refund_requests (status, requested_at)
  WHERE status IN ('PENDING_REFUND', 'REFUND_INITIATED');

/* ─────────────────────────── orders: contexto de pago ─────────────────────────── */

ALTER TABLE orders ADD COLUMN last_payment_error text;
ALTER TABLE orders ADD COLUMN payment_method text;
-- La cuenta de PayPal que efectivamente pagó puede no ser el email de
-- contacto del pedido (alguien le pide a un amigo con cuenta PayPal que
-- pague). No reemplaza `orders.email` — es un dato adicional para soporte.
ALTER TABLE orders ADD COLUMN payer_email text;

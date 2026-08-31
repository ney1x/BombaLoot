-- ════════════════════════════════════════════════════════════════════
-- Loadout · esquema inicial
--
-- Escrita a mano y revisada: lleva índices parciales, CHECK compuestos y un
-- CONSTRAINT TRIGGER diferido que `drizzle-kit generate` no produce solo.
-- `src/server/db/schema.ts` refleja esto para dar tipos; este archivo es el
-- que corre.
--
-- Postgres 13+ trae gen_random_uuid() de fábrica: sin extensiones.
--
-- Sin BEGIN/COMMIT: el runner (`migrate.ts`) envuelve cada archivo en una
-- transacción junto con su registro en `_migrations`, para que aplicar y
-- anotar sean atómicos.
-- ════════════════════════════════════════════════════════════════════

/* ─────────────────────────── enums ─────────────────────────── */

CREATE TYPE user_role          AS ENUM ('CUSTOMER','ADMIN');
CREATE TYPE code_status        AS ENUM ('AVAILABLE','RESERVED','PAID','DELIVERED','VOID');
CREATE TYPE reservation_status AS ENUM ('ACTIVE','CONSUMED','EXPIRED','CANCELLED');
CREATE TYPE payment_status     AS ENUM ('PENDING','PAID','FAILED','REFUNDED');
CREATE TYPE delivery_status    AS ENUM ('PENDING','DELIVERED','UNAVAILABLE');
CREATE TYPE payment_provider   AS ENUM ('WOMPI','PAYPAL');
CREATE TYPE discount_kind      AS ENUM ('PERCENT','FIXED');
CREATE TYPE discount_scope     AS ENUM ('ORDER','GAME','PRODUCT');

/* ─────────────────────────── identidad ─────────────────────────── */

CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL,
  email_verified_at timestamptz,
  password_hash     text NOT NULL,
  name              text,
  role              user_role NOT NULL DEFAULT 'CUSTOMER',
  purchases_count   integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_purchases_count_positive CHECK (purchases_count >= 0)
);

-- Unicidad insensible a mayúsculas sin depender de la extensión citext.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  ip           inet,
  user_agent   text
);

CREATE INDEX sessions_user_idx   ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

/* ─────────────────────────── catálogo ─────────────────────────── */

CREATE TABLE games (
  id          text PRIMARY KEY,
  label       text NOT NULL,
  short_label text NOT NULL,
  color_deep  text NOT NULL,
  color_base  text NOT NULL,
  color_tint  text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true
);

-- Sin columna de stock, a propósito: la disponibilidad se cuenta sobre `codes`.
CREATE TABLE products (
  id            text PRIMARY KEY,
  game_id       text NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  denomination  text NOT NULL,
  unit          text NOT NULL,
  price_cop     bigint NOT NULL,
  max_per_order integer NOT NULL DEFAULT 10,
  low_stock_at  integer NOT NULL DEFAULT 5,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_price_positive         CHECK (price_cop > 0),
  CONSTRAINT products_max_per_order_positive CHECK (max_per_order > 0)
);

CREATE UNIQUE INDEX products_variant_key ON products (game_id, denomination, unit);
CREATE INDEX products_game_idx ON products (game_id);

/* ─────────────────────────── comercial ─────────────────────────── */

CREATE TABLE loyalty_tiers (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  min_purchases integer NOT NULL UNIQUE,
  discount_pct  numeric(5,2) NOT NULL,
  benefits      jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order    integer NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  CONSTRAINT loyalty_min_purchases_positive CHECK (min_purchases >= 0),
  CONSTRAINT loyalty_discount_range         CHECK (discount_pct >= 0 AND discount_pct <= 100)
);

CREATE TABLE discount_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text UNIQUE,
  kind              discount_kind NOT NULL,
  value             numeric(12,2) NOT NULL,
  scope             discount_scope NOT NULL DEFAULT 'ORDER',
  scope_ref         text,
  min_subtotal_cop  bigint NOT NULL DEFAULT 0,
  starts_at         timestamptz,
  ends_at           timestamptz,
  max_uses          integer,
  uses_count        integer NOT NULL DEFAULT 0,
  max_uses_per_user integer,
  stackable         boolean NOT NULL DEFAULT false,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discount_value_positive   CHECK (value > 0),
  CONSTRAINT discount_window           CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  -- El techo de canjes lo vigila el motor; el servicio incrementa con
  -- condición y comprueba filas afectadas, igual que el reclamo de códigos.
  CONSTRAINT discount_uses_within_max  CHECK (max_uses IS NULL OR uses_count <= max_uses)
);

/* ─────────────────────────── pedidos ─────────────────────────── */

CREATE TABLE orders (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number            text NOT NULL UNIQUE,
  -- sha256 del token opaco. El número de pedido NO da acceso al código.
  access_token_hash       bytea NOT NULL UNIQUE,
  access_token_revoked_at timestamptz,
  user_id                 uuid REFERENCES users(id) ON DELETE SET NULL,
  email                   text NOT NULL,
  buyer_name              text,
  payment_status          payment_status  NOT NULL DEFAULT 'PENDING',
  delivery_status         delivery_status NOT NULL DEFAULT 'PENDING',
  subtotal_cop            bigint NOT NULL,
  discount_cop            bigint NOT NULL DEFAULT 0,
  total_cop               bigint NOT NULL,
  currency                text NOT NULL DEFAULT 'COP',
  loyalty_tier_id         text REFERENCES loyalty_tiers(id) ON DELETE RESTRICT,
  payment_expires_at      timestamptz,
  paid_at                 timestamptz,
  delivered_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT orders_amounts_positive   CHECK (subtotal_cop >= 0 AND discount_cop >= 0 AND total_cop >= 0),
  -- La aritmética la verifica el motor, no la aplicación.
  CONSTRAINT orders_total_matches      CHECK (total_cop = subtotal_cop - discount_cop),
  CONSTRAINT orders_paid_has_timestamp CHECK (payment_status <> 'PAID' OR paid_at IS NOT NULL),
  CONSTRAINT orders_currency_iso       CHECK (char_length(currency) = 3)
);

CREATE INDEX orders_user_idx  ON orders (user_id);
CREATE INDEX orders_email_idx ON orders (email);

CREATE TABLE order_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id     text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  -- Snapshots: un cambio de precio o de nombre no reescribe la historia.
  game_label     text NOT NULL,
  denomination   text NOT NULL,
  unit           text NOT NULL,
  quantity       integer NOT NULL,
  unit_price_cop bigint NOT NULL,
  line_total_cop bigint NOT NULL,
  CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT order_items_line_total        CHECK (line_total_cop = unit_price_cop * quantity)
);

CREATE UNIQUE INDEX order_items_order_product_key ON order_items (order_id, product_id);

CREATE TABLE reservations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status      reservation_status NOT NULL DEFAULT 'ACTIVE',
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  guest_key   text,
  expires_at  timestamptz NOT NULL,
  order_id    uuid REFERENCES orders(id) ON DELETE SET NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_has_owner CHECK (user_id IS NOT NULL OR guest_key IS NOT NULL)
);

CREATE INDEX reservations_active_expiry_idx ON reservations (expires_at)
  WHERE status = 'ACTIVE';

/* ─────────────────────────── inventario ─────────────────────────── */

CREATE TABLE code_batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  source      text NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE codes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  status             code_status NOT NULL DEFAULT 'AVAILABLE',
  -- AES-256-GCM. El texto plano no toca disco ni logs.
  secret_cipher      bytea NOT NULL,
  secret_nonce       bytea NOT NULL,
  secret_tag         bytea NOT NULL,
  -- HMAC-SHA256 con pimienta: deduplica sin permitir fuerza bruta offline.
  secret_fingerprint bytea NOT NULL,
  -- Puntero temporal: si vence, otro comprador se lo lleva.
  reservation_id     uuid REFERENCES reservations(id) ON DELETE SET NULL,
  reserved_until     timestamptz,
  -- Puntero permanente: mientras no sea NULL, el barrido no lo toca.
  order_item_id      uuid REFERENCES order_items(id) ON DELETE RESTRICT,
  batch_id           uuid REFERENCES code_batches(id) ON DELETE SET NULL,
  delivered_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),

  -- El mismo código jamás entra dos veces al inventario.
  CONSTRAINT codes_secret_fingerprint_key UNIQUE (secret_fingerprint),

  -- Coherencia de estado verificada por el motor, no por la app.
  CONSTRAINT codes_reserved_has_deadline
    CHECK (status <> 'RESERVED' OR reserved_until IS NOT NULL),
  CONSTRAINT codes_sold_has_item
    CHECK (status NOT IN ('PAID','DELIVERED') OR order_item_id IS NOT NULL),
  CONSTRAINT codes_available_is_clean
    CHECK (status <> 'AVAILABLE'
           OR (reservation_id IS NULL AND order_item_id IS NULL AND reserved_until IS NULL))
);

-- Camino caliente del reclamo: el índice cubre solo filas tomables.
CREATE INDEX codes_claimable_idx ON codes (product_id, created_at)
  WHERE status = 'AVAILABLE' AND order_item_id IS NULL;

-- Reservas recuperables. `order_item_id IS NULL` es lo que impide que el
-- barrido libere un código cuyo pedido ya está esperando confirmación de pago.
CREATE INDEX codes_reclaimable_idx ON codes (reserved_until)
  WHERE status = 'RESERVED' AND order_item_id IS NULL;

CREATE INDEX codes_order_item_idx   ON codes (order_item_id);
CREATE INDEX codes_reservation_idx  ON codes (reservation_id);

/* ─────────────────────────── pagos y descuentos ─────────────────────────── */

CREATE TABLE payment_intents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider     payment_provider NOT NULL,
  provider_ref text,
  status       text NOT NULL,
  amount_cop   bigint NOT NULL,
  raw_payload  jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Ancla de idempotencia para los webhooks de la fase de pagos.
CREATE UNIQUE INDEX payment_intents_provider_ref_key
  ON payment_intents (provider, provider_ref);
CREATE INDEX payment_intents_order_idx ON payment_intents (order_id);

CREATE TABLE order_discounts (
  order_id   uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rule_id    uuid REFERENCES discount_rules(id) ON DELETE SET NULL,
  source     text NOT NULL,
  label      text NOT NULL,
  amount_cop bigint NOT NULL,
  PRIMARY KEY (order_id, source, label),
  CONSTRAINT order_discounts_amount_positive CHECK (amount_cop >= 0)
);

/* ─────────────────────────── auditoría ─────────────────────────── */

CREATE TABLE audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_type  text NOT NULL,
  actor_id    uuid,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip          inet,
  user_agent  text
);

CREATE INDEX audit_entity_idx ON audit_logs (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_action_idx ON audit_logs (action, occurred_at DESC);

/* ══════════════════ invariantes que no caben en un CHECK ══════════════════ */

-- Un order_item con quantity = N debe terminar con exactamente N códigos.
-- Diferido: se evalúa en COMMIT, cuando los códigos ya están asignados.
CREATE OR REPLACE FUNCTION assert_order_item_code_count() RETURNS trigger AS $$
DECLARE
  actual integer;
BEGIN
  SELECT count(*) INTO actual FROM codes WHERE order_item_id = NEW.id;
  IF actual <> NEW.quantity THEN
    RAISE EXCEPTION
      'order_item % declara % código(s) pero tiene % asignado(s)',
      NEW.id, NEW.quantity, actual
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER order_item_code_count
  AFTER INSERT OR UPDATE ON order_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_order_item_code_count();

-- audit_logs es append-only. Un REVOKE no alcanza: el dueño de la tabla lo
-- ignora. Un trigger aplica a todos, incluido el superusuario.
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs es append-only: % no está permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_rewrite
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only();

-- ════════════════════════════════════════════════════════════════════
-- Soporte — tickets y conversación cliente↔admin/SUPPORT.
--
-- El rol SUPPORT ya existía en `user_role` desde 0002_auth.sql, "preparado
-- para futuro". Esta es la primera funcionalidad que realmente lo usa.
-- ════════════════════════════════════════════════════════════════════

CREATE TYPE support_ticket_category AS ENUM (
  'NO_CODE',
  'CODE_INVALID',
  'ORDER_ISSUE',
  'REFUND_REQUEST',
  'PAYMENT_PENDING',
  'DELIVERED_NOT_RECEIVED',
  'ACCOUNT_ISSUE',
  'OTHER'
);

CREATE TYPE support_ticket_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

CREATE TYPE support_message_sender AS ENUM ('CUSTOMER', 'ADMIN');

/* ─────────────────────────── support_tickets ─────────────────────────── */

-- Acceso de invitado por `access_token_hash` — mismo patrón que
-- `orders.access_token_hash`: se guarda el sha256 del token opaco, nunca el
-- token en claro. `order_id` se resuelve al crear el ticket buscando
-- `order_number_input` contra `orders`; si no matchea, el texto crudo se
-- guarda igual para que soporte lo vea.
CREATE TABLE support_tickets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number       text NOT NULL UNIQUE,
  access_token_hash   bytea NOT NULL UNIQUE,
  user_id             uuid REFERENCES users(id) ON DELETE SET NULL,
  email               text NOT NULL,
  category            support_ticket_category NOT NULL,
  status              support_ticket_status NOT NULL DEFAULT 'OPEN',
  order_id            uuid REFERENCES orders(id) ON DELETE SET NULL,
  order_number_input  text,
  assigned_to         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  last_message_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_tickets_status_idx ON support_tickets (status, last_message_at);
CREATE INDEX support_tickets_order_idx ON support_tickets (order_id);
CREATE INDEX support_tickets_user_idx ON support_tickets (user_id);

/* ─────────────────────────── support_messages ─────────────────────────── */

CREATE TABLE support_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type     support_message_sender NOT NULL,
  sender_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_messages_ticket_idx ON support_messages (ticket_id, created_at);

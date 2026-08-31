-- ════════════════════════════════════════════════════════════════════
-- Fase 3 — Autenticación y cuentas.
--
-- `users` y `sessions` ya existen desde 0000_init.sql (con `role` y
-- `password_hash` incluidos desde el diseño original). Lo que falta acá:
-- el rol SUPPORT preparado sin funcionalidad, y la tabla de tokens de
-- recuperación de contraseña.
-- ════════════════════════════════════════════════════════════════════

-- SUPPORT queda disponible en el enum pero sin ningún guard que lo use
-- todavía — "preparado para futuro" tal como se pidió, no funcional hoy.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPPORT';

-- Tokens de recuperación de contraseña.
--
-- Mismo patrón que `orders.access_token_hash`: se guarda el sha256 del token
-- opaco, nunca el token. Un volcado de esta tabla no permite fabricar un
-- link de recuperación válido para nadie.
CREATE TABLE password_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  bytea NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);

-- Camino caliente de "¿este token sigue siendo válido?": sin usar, sin
-- vencer. Un índice parcial en vez de escanear tokens ya consumidos.
CREATE INDEX password_reset_tokens_valid_idx ON password_reset_tokens (expires_at)
  WHERE used_at IS NULL;

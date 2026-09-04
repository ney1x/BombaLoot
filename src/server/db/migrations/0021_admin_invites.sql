-- ════════════════════════════════════════════════════════════════════
-- Invitaciones a ADMIN. Mismo patrón de token opaco que
-- `password_reset_tokens` (solo se guarda el sha256, nunca el valor) —
-- quien tiene el link es quien acepta, y aceptar exige además estar
-- logueado con el mismo email al que se mandó la invitación.
--
-- Un solo invite PENDIENTE por email a la vez (índice único parcial):
-- evita mandar dos invitaciones vivas para la misma persona, sin impedir
-- reinvitar después de que la anterior venció o se canceló.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE admin_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  token_hash  bytea NOT NULL UNIQUE,
  invited_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX admin_invites_pending_email_key ON admin_invites (lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- ════════════════════════════════════════════════════════════════════
-- Suspensión de cuentas — hasta ahora `role` era la única palanca que un
-- admin tenía sobre un usuario (CUSTOMER/ADMIN/SUPPORT), y no había forma
-- de bloquear una cuenta sin borrarla. `suspended_at` es la fuente de
-- verdad ("suspendida" = NOT NULL); `reason`/`by` son metadata de auditoría,
-- no condición.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN suspended_at     timestamptz,
  ADD COLUMN suspended_reason text,
  ADD COLUMN suspended_by     uuid REFERENCES users(id) ON DELETE SET NULL;

-- Camino caliente de "¿hay cuentas suspendidas?" para el panel admin, sin
-- escanear toda la tabla.
CREATE INDEX users_suspended_idx ON users (suspended_at) WHERE suspended_at IS NOT NULL;

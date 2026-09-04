-- ════════════════════════════════════════════════════════════════════
-- Login/registro con Google. `password_hash` deja de ser obligatoria —
-- una cuenta creada por Google no tiene contraseña propia hasta que el
-- usuario decida ponerle una desde el perfil (no existe ese flujo todavía,
-- se agrega cuando haga falta). `google_id` es el `sub` que Google
-- devuelve — estable, único por cuenta de Google, nunca el email (el
-- email de Google SÍ puede cambiar).
--
-- El CHECK final es la garantía real de que ninguna fila quede sin forma
-- de autenticarse: o tiene contraseña, o tiene Google, nunca ninguna de
-- las dos.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN google_id text;

CREATE UNIQUE INDEX users_google_id_key ON users (google_id) WHERE google_id IS NOT NULL;

ALTER TABLE users ADD CONSTRAINT users_has_auth_method
  CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL);

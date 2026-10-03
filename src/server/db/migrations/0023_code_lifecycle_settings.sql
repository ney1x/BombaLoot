-- Preferencias editables de vigencia de códigos y equidad entre admins.
-- Fila única (patrón singleton): id boolean PRIMARY KEY DEFAULT true CHECK (id)
-- fuerza que exista exactamente una fila para siempre.
CREATE TABLE code_lifecycle_settings (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
  expiry_days        integer NOT NULL DEFAULT 90,
  risk_window_days   integer NOT NULL DEFAULT 70,
  fairness_gap_days  integer NOT NULL DEFAULT 45,
  updated_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (expiry_days > risk_window_days AND risk_window_days > 0 AND fairness_gap_days > 0)
);

INSERT INTO code_lifecycle_settings (id) VALUES (true);

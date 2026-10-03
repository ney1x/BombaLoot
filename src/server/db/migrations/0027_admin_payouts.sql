-- ════════════════════════════════════════════════════════════════════
-- Pagos a admins (liquidaciones) — para saber cuánto se le debe a cada
-- admin por los códigos que cargó y se vendieron.
--
-- La ganancia ya se calcula (ver `getAdminEarnings`: neto por admin según
-- `code_batches.uploaded_by` del código vendido). Esta tabla solo registra
-- lo que ya se le transfirió a cada uno — pendiente = neto total − pagado.
-- Hoy se carga a mano (transferencia Nequi/Bancolombia hecha por fuera);
-- cuando exista API de dispersión (Wompi Pagos a Terceros / Nequi), el
-- webhook insertará acá mismo con `reference` = id de la dispersión.
--
-- Solo inserción: un pago mal cargado se corrige con otro en negativo, no
-- editando ni borrando — mismo criterio de historia inmutable que los
-- códigos vendidos.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE admin_payouts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_cop  bigint NOT NULL CHECK (amount_cop <> 0),
  method      text NOT NULL,
  reference   text,
  note        text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_payouts_admin_idx ON admin_payouts (admin_id, created_at);

CREATE FUNCTION admin_payouts_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_payouts es solo inserción: registrá un ajuste en negativo';
END;
$$;

CREATE TRIGGER admin_payouts_no_update_delete
  BEFORE UPDATE OR DELETE ON admin_payouts
  FOR EACH ROW EXECUTE FUNCTION admin_payouts_immutable();

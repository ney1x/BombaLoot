-- ════════════════════════════════════════════════════════════════════
-- Auditoría de seguridad, 2026-09-04 — un código vendido tampoco se puede
-- BORRAR. `codes_prevent_sold_regression_trg` (0005) ya cubre UPDATE
-- (ningún cambio de status/order_item_id sobre un código PAID/DELIVERED),
-- pero un DELETE directo sobre esa misma fila no pasaba por ahí — hoy
-- `admin-codes.ts#deleteCode` ya lo bloquea en la capa de aplicación
-- (`lockEditableCode` exige status='AVAILABLE'), así que no hay un camino
-- real para explotarlo, pero esa garantía dependía solo de que ningún
-- código futuro (script, consola, una función admin nueva) se salte esa
-- capa. Mismo criterio que el resto de este archivo: la base es el
-- respaldo, no la única barrera.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION codes_prevent_sold_deletion() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('PAID', 'DELIVERED') THEN
    RAISE EXCEPTION
      'codes: el código % ya está vendido (status=%) y no se puede borrar.',
      OLD.id, OLD.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER codes_prevent_sold_deletion_trg
  BEFORE DELETE ON codes
  FOR EACH ROW
  EXECUTE FUNCTION codes_prevent_sold_deletion();

-- ════════════════════════════════════════════════════════════════════
-- Fase 5 (cierre) — un código vendido nunca vuelve al inventario.
--
-- Análisis completo en el reporte de la sesión: ningún código de
-- `webhook-service.ts` / `refund-service.ts` / `delivery-service.ts` toca
-- `codes` de forma que pueda liberar un código ya PAID/DELIVERED — pero
-- eso hoy es una propiedad de "nadie escribió el bug todavía", no una
-- garantía de la base. Este trigger la convierte en la segunda: un código
-- vendido (PAID o DELIVERED) queda inmutable salvo el único avance legítimo
-- PAID → DELIVERED, y su `order_item_id` no puede cambiar ni vaciarse una
-- vez asignado a una venta confirmada.
--
-- A propósito NO alcanza a `RESERVED`: un código apenas reservado durante
-- el checkout (pago todavía no confirmado) sigue siendo recuperable si el
-- pedido entero se abandona — eso es `sweepExpiredPendingOrders`
-- (fase 4, ya aprobado y probado) y sigue funcionando igual. La garantía
-- nueva es más angosta y más fuerte donde importa: una vez que el pago se
-- confirmó (`status IN ('PAID','DELIVERED')`), no hay vuelta atrás posible,
-- ni por un bug futuro en un worker, ni por una operación manual mal
-- escrita.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION codes_prevent_sold_regression() RETURNS trigger AS $$
BEGIN
  IF OLD.status NOT IN ('PAID', 'DELIVERED') THEN
    RETURN NEW; -- código todavía no vendido: sin restricción acá.
  END IF;

  -- Único avance permitido desde un código vendido.
  IF NEW.status <> OLD.status AND NOT (OLD.status = 'PAID' AND NEW.status = 'DELIVERED') THEN
    RAISE EXCEPTION
      'codes: el código % ya está vendido (status=%) y no puede pasar a status=%. '
      'Un código PAID/DELIVERED es inmutable salvo PAID -> DELIVERED.',
      OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- El puntero de venta tampoco se mueve ni se vacía una vez vendido.
  IF NEW.order_item_id IS DISTINCT FROM OLD.order_item_id THEN
    RAISE EXCEPTION
      'codes: el código % ya está vendido y su order_item_id no puede cambiar (% -> %)',
      OLD.id, OLD.order_item_id, NEW.order_item_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER codes_prevent_sold_regression_trg
  BEFORE UPDATE ON codes
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.order_item_id IS DISTINCT FROM NEW.order_item_id)
  EXECUTE FUNCTION codes_prevent_sold_regression();

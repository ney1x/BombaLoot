-- ════════════════════════════════════════════════════════════════════
-- Hallazgos A1 y M2 de la auditoría técnica post Fase 1/2.
--
-- 0000_init.sql ya está aplicada (o puede estarlo) en bases existentes, así
-- que estos cambios van en un archivo nuevo, no editando el anterior. Ese es
-- justo el motivo de M6 (checksum de migraciones): para que editar un
-- archivo ya aplicado se note.
-- ════════════════════════════════════════════════════════════════════

-- A1: audit_logs es append-only "de verdad".
--
-- El trigger `audit_logs_no_rewrite` de 0000_init.sql es
-- `BEFORE UPDATE OR DELETE`. TRUNCATE es un comando de DDL/utility distinto
-- en Postgres — no dispara triggers UPDATE/DELETE — así que
-- `TRUNCATE audit_logs;` vaciaba la tabla entera sin ningún error. Probado
-- empíricamente antes de este fix:
--
--   INSERT 0 1  →  TRUNCATE TABLE  →  SELECT count(*) = 0   (sin error)
--
-- La sintaxis de trigger es la misma función, evento distinto: Postgres sí
-- soporta `BEFORE TRUNCATE` como trigger de sentencia.
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only();

-- M2: el índice de reservas recuperables no llevaba product_id.
--
-- `codes_reclaimable_idx` original era `(reserved_until) WHERE status =
-- 'RESERVED' AND order_item_id IS NULL` — sirve para el barrido global, pero
-- el reclamo (`claimCodesForProduct`) siempre filtra primero por
-- `product_id = $1`. Sin `product_id` en el índice, esa rama del predicado
-- (códigos RESERVED vencidos de UN producto) fuerza un filtro adicional
-- sobre las filas que el índice sí encuentra por reserved_until, en vez de
-- ir directo a las del producto. Con catálogos chicos no se nota; con miles
-- de códigos vencidos de otros productos sí.
DROP INDEX IF EXISTS codes_reclaimable_idx;

CREATE INDEX codes_reclaimable_idx ON codes (product_id, reserved_until)
  WHERE status = 'RESERVED' AND order_item_id IS NULL;

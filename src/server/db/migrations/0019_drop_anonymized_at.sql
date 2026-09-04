-- ════════════════════════════════════════════════════════════════════
-- Elimina el autoservicio de "eliminar mi cuenta" del backend (ver
-- deleteOwnAccount, ya borrada de auth-service.ts) — esta columna era el
-- único lugar que la usaba, y quedó huérfana.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE users DROP COLUMN anonymized_at;

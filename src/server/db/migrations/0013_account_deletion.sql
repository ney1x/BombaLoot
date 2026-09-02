-- ════════════════════════════════════════════════════════════════════
-- Autoservicio de derechos de datos (Política de Privacidad §9: conocer,
-- corregir, eliminar). Hasta ahora esos derechos solo se podían ejercer
-- escribiéndole a soporte a mano — esto agrega el botón real de
-- "eliminar mi cuenta" en el perfil. La exportación ("conocer qué
-- información tenemos") no necesita columna nueva: arma el JSON al vuelo
-- desde lo que ya existe (pedidos, tickets, perfil).
--
-- `anonymized_at` NOT NULL = cuenta eliminada por el propio usuario. No es
-- lo mismo que `suspended_at` (que es una acción de un admin sobre otro):
-- acá el login ya queda bloqueado solo con reescribir `password_hash` por
-- un valor no reproducible — esta columna es registro, no el mecanismo de
-- bloqueo.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN anonymized_at timestamptz;

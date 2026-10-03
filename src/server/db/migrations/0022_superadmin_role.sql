-- ════════════════════════════════════════════════════════════════════
-- Rol SUPERADMIN — por encima de ADMIN. Invitar/revocar/restaurar el rol
-- ADMIN pasa a ser exclusivo de SUPERADMIN (antes lo podía hacer
-- cualquier ADMIN); todo lo demás que ya podía hacer un ADMIN lo sigue
-- pudiendo hacer un SUPERADMIN igual (los guards tratan SUPERADMIN como
-- superset de ADMIN, nunca un rol aparte con su propio set de permisos).
--
-- Sin asignar acá a propósito: quién es el primer SUPERADMIN es la misma
-- decisión manual, deliberada, que ya es asignar el primer ADMIN — no una
-- migración que corre igual en cualquier ambiente.
--
-- `ALTER TYPE ... ADD VALUE` no se puede usar en la misma transacción en
-- la que se agrega (restricción de Postgres) — por eso esto va solo en su
-- propia migración, sin ningún UPDATE al lado.
-- ════════════════════════════════════════════════════════════════════

ALTER TYPE user_role ADD VALUE 'SUPERADMIN';

-- ════════════════════════════════════════════════════════════════════
-- Bloqueo por IP. Hasta ahora la IP se guardaba (`sessions.ip`,
-- `audit_logs.ip`) pero nada la usaba para decidir nada — quedaba como
-- dato, nunca como control. Esta tabla es la lista de IPs bloqueadas; el
-- chequeo vive en `security-service.ts` y se llama desde registro, login,
-- checkout y creación de tickets de soporte.
--
-- `ip` es `text`, no `inet`: `getClientIp()` (request-meta.ts) puede
-- devolver "unknown" cuando no hay proxy header — un tipo `inet` haría
-- fallar esa fila. El precio es no poder usar operadores de red de
-- Postgres (contención de CIDR); no hace falta para el caso de uso de
-- fase 1 (bloquear IPs puntuales, no rangos).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE ip_blocks (
  ip         text PRIMARY KEY,
  reason     text NOT NULL,
  blocked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

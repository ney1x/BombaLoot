-- ════════════════════════════════════════════════════════════════════
-- Rate limiter persistente. El limitador anterior (`rate-limit.ts`) vivía
-- en un `Map` en memoria del proceso — documentado ahí mismo como
-- "no limita nada entre invocaciones" en Vercel serverless, donde cada
-- request puede caer en un proceso Node distinto. Esta tabla reemplaza esa
-- memoria por una fuente compartida real, sin agregar infraestructura
-- nueva (Redis/Upstash): ya hay Postgres, y un rate limiter no necesita
-- más que esto.
--
-- Ventana fija (no deslizante): la clave incluye `window_start` truncado al
-- múltiplo de `windowSeconds` más cercano. Es una aproximación más laxa en
-- el borde de la ventana que la versión en memoria (que sí era deslizante),
-- pero atómica con un solo UPSERT — sin eso, "leer contador, decidir,
-- escribir" en tres pasos sería una carrera bajo concurrencia real, y
-- corregirla habría significado reintroducir el mismo patrón de
-- transacción explícita que ya usa el reclamo de códigos.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE rate_limit_counters (
  key          text NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- Camino caliente de la limpieza periódica (ver `sweepExpiredRateLimits`,
-- llamado desde el mismo cron que ya barre reservas y pedidos vencidos).
CREATE INDEX rate_limit_counters_window_idx ON rate_limit_counters (window_start);

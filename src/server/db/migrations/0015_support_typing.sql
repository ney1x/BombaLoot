-- ════════════════════════════════════════════════════════════════════
-- "Escribiendo…" en el chat de soporte, cliente↔admin. Presencia efímera,
-- no historial: un timestamp que se pisa en cada tecleo y se interpreta
-- como "activo" solo si es reciente (ver getAdminTyping*/getCustomerTyping
-- en support-service.ts) — no hace falta una señal explícita de "dejó de
-- escribir", simplemente expira sola.
--
-- Va en la misma fila del ticket, no en una tabla aparte: es un solo valor
-- por lado, se pisa siempre entero, nunca se acumula ni se consulta por
-- rango de fechas — no hay nada que una tabla separada resolviera mejor acá.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE support_tickets ADD COLUMN customer_typing_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN admin_typing_at timestamptz;

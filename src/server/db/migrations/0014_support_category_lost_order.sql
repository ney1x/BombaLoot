-- ════════════════════════════════════════════════════════════════════
-- Nuevo motivo de contacto: "Perdí mi # de pedido y no recibí correo" —
-- reemplaza a "Quiero solicitar un reembolso" en la lista que ve el
-- comprador (`SUPPORT_CATEGORIES`, lib/support.ts). REFUND_REQUEST no se
-- borra del enum — Postgres no deja quitar valores sin recrear el tipo, y
-- de todas formas los tickets viejos con esa categoría tienen que seguir
-- leyéndose tal cual quedaron, no reescribirse a la fuerza.
--
-- A diferencia del resto de los motivos con pedido de por medio, este
-- nace `orderRequired: false` — la premisa es justamente que la persona
-- NO tiene el número. Se identifica por el email de la compra en su
-- lugar (ver `SupportTicketForm`).
-- ════════════════════════════════════════════════════════════════════

ALTER TYPE support_ticket_category ADD VALUE 'LOST_ORDER_NUMBER';

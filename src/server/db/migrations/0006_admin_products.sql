-- ════════════════════════════════════════════════════════════════════
-- Fase 6B-2 — Productos administrables.
--
-- `products` ya tenía todo lo que el catálogo público necesita
-- (precio, stock derivado de `codes`, `low_stock_at`). Lo único que
-- faltaba para el panel admin es una descripción editable y una marca de
-- "cuándo se editó por última vez" — quién lo hizo ya queda en
-- `audit_logs` (acción `product.updated`), así que no se duplica acá con
-- una columna `updated_by`.
--
-- Sin DELETE físico: `products.is_active` (ya existe desde 0000_init.sql)
-- sigue siendo el único mecanismo para "sacar de venta" un producto — un
-- producto con `order_items`/`codes` históricos no se puede borrar sin
-- romper esas referencias (`order_items.product_id` es `ON DELETE
-- RESTRICT`), y no debería poder borrarse aunque no las tuviera: es el
-- mismo criterio que ya rige el resto del esquema.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

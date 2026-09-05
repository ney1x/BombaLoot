-- ════════════════════════════════════════════════════════════════════
-- Tercer `placement`: "catalog" — la imagen cuadrada (680×680) de
-- /catalogo/[game]. Hasta acá esa imagen salía solo de `product_images`
-- (una por denominación, subida en /admin/productos/[id]); sin eso, cada
-- denominación sin imagen propia caía al placeholder genérico. Mismo
-- patrón que "hero": una fila general por juego (product_id NULL) sirve
-- de fallback para cualquier denominación que no tenga su propia imagen
-- de producto.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE game_visuals DROP CONSTRAINT game_visuals_placement_check;
ALTER TABLE game_visuals
  ADD CONSTRAINT game_visuals_placement_check CHECK (placement IN ('hero', 'showcase', 'catalog'));

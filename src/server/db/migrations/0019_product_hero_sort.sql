-- ════════════════════════════════════════════════════════════════════
-- `products.hero_sort_order` — el rotator de Home mostraba los productos
-- en el mismo orden que el catálogo (juego, después precio) sin forma de
-- cambiarlo. NULL = sigue cayendo a ese orden natural; un número puntual
-- saca a ese producto de ahí y lo ubica en esa posición exacta del
-- rotator, de menor a mayor. Es independiente de `products.price_cop` y
-- del orden del catálogo — solo afecta la secuencia del hero de Home.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE products ADD COLUMN hero_sort_order integer;

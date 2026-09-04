-- ════════════════════════════════════════════════════════════════════
-- `game_visuals.product_id` — el hero de Home rotaba productos
-- (denominaciones) de un mismo juego, pero todos compartían el banner del
-- juego (`product_id IS NULL`, el genérico de siempre). No había forma de
-- que Roblox 840 y Roblox 1050 mostraran imágenes distintas en el hero.
--
-- `product_id` NULL sigue siendo el fallback genérico del juego. Una fila
-- con `product_id` apunta a UN producto puntual — se resuelve aparte
-- (`getActiveProductVisualMap`), nunca se mezcla con el genérico en la
-- misma consulta, así una fila específica de un producto no termina
-- eligiéndose por accidente como "la" del juego entero.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE game_visuals
  ADD COLUMN product_id text REFERENCES products(id) ON DELETE CASCADE;

CREATE INDEX game_visuals_product_idx ON game_visuals (product_id, placement, sort_order)
  WHERE product_id IS NOT NULL;

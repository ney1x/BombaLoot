-- ════════════════════════════════════════════════════════════════════
-- `game_visuals.placement` — el hero grande de Home (1600×670) y el panel
-- de "Elegí tu juego" (600×800) hasta acá compartían la misma fila (misma
-- imagen, recorte distinto vía CSS). El pedido real es poder cargar una
-- imagen DISTINTA para cada lugar, no solo un recorte distinto de la
-- misma — así que cada fila ahora declara para cuál de los dos es.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE game_visuals
  ADD COLUMN placement text NOT NULL DEFAULT 'hero'
    CHECK (placement IN ('hero', 'showcase'));

-- El índice que ya existía (game_id, sort_order) sigue sirviendo para
-- "el primero activo" dentro de game_id — se agrega placement para que
-- ese "primero" se busque por lugar, no mezclando los dos.
DROP INDEX game_visuals_game_idx;
CREATE INDEX game_visuals_game_idx ON game_visuals (game_id, placement, sort_order);

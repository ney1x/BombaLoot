"use client";

import { useMemo, useState } from "react";
import styles from "./catalogo.module.css";
import { GAME_COLORS, GAMES, type GameId, type Product } from "@/lib/products";
import { CatalogProductCard } from "@/components/CatalogProductCard";
import { SearchIcon } from "@/components/icons";

export function CatalogGrid({
  initialGame,
  products,
}: {
  initialGame: GameId | null;
  products: Product[];
}) {
  const [activeGame, setActiveGame] = useState<GameId | null>(initialGame);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesGame = !activeGame || product.gameId === activeGame;
      const matchesQuery =
        !q ||
        product.gameLabel.toLowerCase().includes(q) ||
        product.denomination.toLowerCase().includes(q) ||
        product.unit.toLowerCase().includes(q);
      return matchesGame && matchesQuery;
    });
  }, [activeGame, query, products]);

  return (
    <>
      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <SearchIcon className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Buscar por juego o denominación"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Buscar en el catálogo"
          />
        </div>
        <div className={styles.chips} role="group" aria-label="Filtrar por juego">
          <button
            type="button"
            className={`${styles.chip} ${activeGame === null ? styles.chipActive : ""}`}
            onClick={() => setActiveGame(null)}
          >
            Todos
          </button>
          {GAMES.map((game) => {
            const isActive = activeGame === game.id;
            const color = GAME_COLORS[game.id];
            return (
              <button
                key={game.id}
                type="button"
                className={`${styles.chip} ${isActive ? styles.chipActive : ""}`}
                style={isActive ? { background: color.base, borderColor: color.base } : undefined}
                onClick={() => setActiveGame(game.id)}
              >
                {game.label}
              </button>
            );
          })}
        </div>
        <span className={styles.count}>
          {filtered.length} {filtered.length === 1 ? "producto" : "productos"}
        </span>
      </div>

      {filtered.length > 0 ? (
        <div className={styles.grid}>
          {filtered.map((product) => (
            <CatalogProductCard product={product} key={product.id} />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <h3>No encontramos productos para “{query || GAMES.find((g) => g.id === activeGame)?.label}”.</h3>
          <p>Probá con otro juego o denominación.</p>
          <button
            type="button"
            className={styles.emptyReset}
            onClick={() => {
              setActiveGame(null);
              setQuery("");
            }}
          >
            Ver todo el catálogo
          </button>
        </div>
      )}
    </>
  );
}

import type { Metadata } from "next";
import shared from "../shared.module.css";
import { GAMES } from "@/lib/products";
import { getDb } from "@/server/db/client";
import { listGameVisuals } from "@/server/services/game-visuals";
import { GameVisualsManager } from "@/components/admin/GameVisualsManager";

export const metadata: Metadata = { title: "Juegos — Admin bombaloot" };

export default async function GamesPage() {
  const db = getDb();
  const visualsByGame = await Promise.all(GAMES.map((game) => listGameVisuals(db, game.id)));

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Juegos</h1>
          <p className={shared.subtitle}>
            Banners por juego — hero es el banner grande de Home (1600×670), showcase es el
            panel de &quot;Elegí tu juego&quot; (600×800). Son imágenes independientes. Dentro de
            cada lugar, el activo con menor orden es el que se ve.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {GAMES.map((game, i) => (
          <GameVisualsManager
            key={game.id}
            gameId={game.id}
            gameLabel={game.label}
            initialVisuals={visualsByGame[i]}
          />
        ))}
      </div>
    </div>
  );
}

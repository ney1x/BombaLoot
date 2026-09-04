import type { Metadata } from "next";
import shared from "../shared.module.css";
import { GAMES, sortForHero } from "@/lib/products";
import { getDb } from "@/server/db/client";
import { listGameVisuals } from "@/server/services/game-visuals";
import { listAdminProducts } from "@/server/services/admin-products";
import { GameVisualsManager } from "@/components/admin/GameVisualsManager";
import { HeroOrderManager } from "@/components/admin/HeroOrderManager";

export const metadata: Metadata = { title: "Juegos — Admin BombaLoot" };

export default async function GamesPage() {
  const db = getDb();
  const [visualsByGame, allProducts] = await Promise.all([
    Promise.all(GAMES.map((game) => listGameVisuals(db, game.id))),
    listAdminProducts(db),
  ]);
  const heroOrderProducts = sortForHero(allProducts.filter((p) => p.isActive));

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Juegos</h1>
          <p className={shared.subtitle}>
            Banners por juego — hero es el banner grande de Home (1200×1440, vertical), showcase
            es el panel de &quot;Elegí tu juego&quot; (600×800). Son imágenes independientes.
            Dentro de cada lugar, el activo con menor orden es el que se ve. El hero admite elegir
            una denominación puntual: esa imagen se ve solo cuando el rotator muestra ese producto
            — el resto de las denominaciones del juego siguen cayendo al banner &quot;General&quot;.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <HeroOrderManager
          initialProducts={heroOrderProducts.map((p) => ({
            id: p.id,
            gameLabel: p.gameLabel,
            denomination: p.denomination,
            unit: p.unit,
          }))}
        />
        {GAMES.map((game, i) => (
          <GameVisualsManager
            key={game.id}
            gameId={game.id}
            gameLabel={game.label}
            initialVisuals={visualsByGame[i]}
            products={allProducts
              .filter((p) => p.gameId === game.id)
              .map((p) => ({ id: p.id, denomination: p.denomination, unit: p.unit }))}
          />
        ))}
      </div>
    </div>
  );
}

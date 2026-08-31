import type { Metadata } from "next";
import styles from "./catalogo.module.css";
import { CatalogGrid } from "./CatalogGrid";
import { GAMES, type GameId } from "@/lib/products";
import { toStoreProduct } from "@/lib/catalog-mapper";
import { getDb } from "@/server/db/client";
import { listCatalogProducts } from "@/server/services/catalog";

export const metadata: Metadata = {
  title: "Catálogo — Loadout",
};

function parseGame(value: string | string[] | undefined): GameId | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return GAMES.some((game) => game.id === raw) ? (raw as GameId) : null;
}

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialGame = parseGame(params.game);
  const catalogProducts = await listCatalogProducts(getDb());
  const products = catalogProducts.map(toStoreProduct);

  return (
    <main className={styles.main}>
      <div className={styles.head}>
        <h1>Catálogo</h1>
        <p>
          Todas las denominaciones disponibles ahora mismo. El stock que ves acá
          se calcula en el momento — nunca prometemos más de lo que hay.
        </p>
      </div>
      <CatalogGrid initialGame={initialGame} products={products} />
    </main>
  );
}

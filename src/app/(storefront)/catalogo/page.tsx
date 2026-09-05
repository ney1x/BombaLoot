import type { Metadata } from "next";
import Link from "next/link";
import styles from "./catalogo.module.css";
import { CatalogGrid } from "./CatalogGrid";
import { Breadcrumb } from "@/components/Breadcrumb";
import { GAMES, type GameId } from "@/lib/products";
import { toStoreProduct } from "@/lib/catalog-mapper";
import { pageMetadata, productsJsonLd, toJsonLdProduct } from "@/lib/seo";
import { getDb } from "@/server/db/client";
import { listCatalogProducts } from "@/server/services/catalog";
import { getPriceEstimateContext } from "@/server/services/geo-price";

export const metadata: Metadata = pageMetadata({
  title: "Recargas y códigos digitales en Colombia | BombaLoot",
  description:
    "Todas las denominaciones disponibles de Valorant, Roblox, League of Legends y Overwatch en Colombia, con stock en tiempo real y entrega automática.",
  path: "/catalogo",
});

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
  const [catalogProducts, priceEstimate] = await Promise.all([
    listCatalogProducts(getDb()),
    getPriceEstimateContext(),
  ]);
  const products = catalogProducts.map(toStoreProduct);

  return (
    <main className={styles.main}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: productsJsonLd(products.map(toJsonLdProduct)) }}
      />
      <Breadcrumb items={[{ name: "Home", path: "" }, { name: "Catálogo", path: "/catalogo" }]} />
      <div className={styles.head}>
        <h1>Catálogo</h1>
        <p>
          Todas las denominaciones disponibles ahora mismo. El stock que ves acá
          se calcula en el momento — nunca prometemos más de lo que hay.
        </p>
        {/* Links reales (no JS-only) a cada juego — los chips de abajo
            filtran en el momento con onClick, sin <a href>, así que sin
            esto Google no tenía ningún link crawleable DESDE /catalogo
            hacia cada /catalogo/[game] (sí lo tiene, aparte, desde Home vía
            GameShowcase — pero /catalogo, el nivel intermedio de la
            jerarquía, no aportaba nada al árbol). También ayuda a quien
            navega sin JS. Como línea de texto, no como fila de pills, para
            no repetir visualmente los chips de filtro de abajo. */}
        <nav aria-label="Juegos disponibles" className={styles.gameLinks}>
          Explorá por juego:{" "}
          {GAMES.map((game) => (
            <Link key={game.id} href={`/catalogo/${game.id}`}>
              {game.label}
            </Link>
          ))}
        </nav>
      </div>

      <CatalogGrid initialGame={initialGame} products={products} priceEstimate={priceEstimate} />
    </main>
  );
}

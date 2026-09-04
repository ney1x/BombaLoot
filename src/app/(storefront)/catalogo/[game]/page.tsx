import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { GamePurchase } from "@/components/GamePurchase";
import { GameInfoSection, RelatedGamesSection } from "@/components/GameInfoSection";
import { GAMES, GAME_SEO, type GameId } from "@/lib/products";
import { toStoreProduct } from "@/lib/catalog-mapper";
import { pageMetadata, productsJsonLd, toJsonLdProduct } from "@/lib/seo";
import { getDb } from "@/server/db/client";
import { listCatalogProducts } from "@/server/services/catalog";

function isGameId(value: string): value is GameId {
  return GAMES.some((game) => game.id === value);
}

export function generateStaticParams() {
  return GAMES.map((game) => ({ game: game.id }));
}

/**
 * Cada juego arma su propio title/description/canonical/OG/Twitter — antes
 * esto devolvía solo `{ title }`, así que el resto de los campos (Open
 * Graph, Twitter, canonical) le quedaban heredados enteros del layout raíz
 * (mismo texto genérico del sitio para los 4 juegos, `/catalogo/valorant`
 * incluido). `GAME_SEO` es la única fuente de la copy real por juego —acá
 * no se duplica, solo se arma el objeto `Metadata` completo con
 * `pageMetadata`.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ game: string }>;
}): Promise<Metadata> {
  const { game: gameParam } = await params;
  if (!isGameId(gameParam)) return {};
  return pageMetadata({ ...GAME_SEO[gameParam], path: `/catalogo/${gameParam}` });
}

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string }>;
  searchParams: Promise<{ select?: string }>;
}) {
  const { game: gameParam } = await params;
  if (!isGameId(gameParam)) notFound();

  const game = GAMES.find((g) => g.id === gameParam)!;
  const catalogProducts = await listCatalogProducts(getDb());
  const products = catalogProducts.filter((p) => p.gameId === gameParam).map(toStoreProduct);
  if (products.length === 0) notFound();

  const { select } = await searchParams;

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: productsJsonLd(products.map(toJsonLdProduct)) }}
      />
      <Breadcrumb
        items={[
          { name: "Home", path: "" },
          { name: "Catálogo", path: "/catalogo" },
          { name: game.label, path: `/catalogo/${gameParam}` },
        ]}
      />
      <GamePurchase game={game} products={products} initialSelectId={select} />
      <GameInfoSection game={game} />
      <RelatedGamesSection game={game} />
    </main>
  );
}

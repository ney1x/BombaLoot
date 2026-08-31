import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GamePurchase } from "@/components/GamePurchase";
import { GAMES, type GameId } from "@/lib/products";
import { toStoreProduct } from "@/lib/catalog-mapper";
import { getDb } from "@/server/db/client";
import { listCatalogProducts } from "@/server/services/catalog";

function isGameId(value: string): value is GameId {
  return GAMES.some((game) => game.id === value);
}

export function generateStaticParams() {
  return GAMES.map((game) => ({ game: game.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ game: string }>;
}): Promise<Metadata> {
  const { game: gameParam } = await params;
  if (!isGameId(gameParam)) return {};
  const game = GAMES.find((g) => g.id === gameParam)!;
  return { title: `${game.label} — Loadout` };
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

  return <GamePurchase game={game} products={products} initialSelectId={select} />;
}

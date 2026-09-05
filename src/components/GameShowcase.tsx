import Link from "next/link";
import type { CSSProperties } from "react";
import styles from "./GameShowcase.module.css";
import { GameImageSlot } from "./GameImageSlot";
import { GAME_MARKS, ChevronRightIcon } from "./icons";
import { GAMES, GAME_COLORS, formatCop, type GameId } from "@/lib/products";
import { formatEstimate, type PriceEstimateContext } from "@/lib/currency";

export function GameShowcase({
  gameImages,
  startingPriceByGame,
  priceEstimate,
  prefetch,
}: {
  gameImages: Record<string, string>;
  /** Precio mínimo real por juego, calculado en el server desde el catálogo de la base — nunca el set de productos estático de `lib/products.ts` (eso es solo semilla/tipos, se desincroniza de lo que el admin edita). */
  startingPriceByGame: Record<GameId, number | null>;
  /** Conversión de referencia según el país del visitante — `null` si no aplica (ver `@/server/services/geo-price`). */
  priceEstimate?: PriceEstimateContext | null;
  /**
   * `undefined` deja el default de Next (prefetch al entrar en viewport).
   * La home pasa `false`: con las 4 tarjetas + el resto de la página
   * disparando prefetch a la vez, esa ráfaga de fetches RSC concurrentes
   * (uno por juego, cada uno pegándole a la base) competía por el hilo
   * principal justo cuando el navegador intentaba pintar por primera vez —
   * medido: ~2.4s de FCP en un DOM que ya estaba listo en 22ms. En
   * `/catalogo/[game]`, donde este mismo componente no se usa, no aplica.
   */
  prefetch?: boolean;
}) {
  return (
    <div className={styles.grid}>
      {GAMES.map((game) => {
        const color = GAME_COLORS[game.id];
        const Mark = GAME_MARKS[game.id];
        return (
          <Link
            href={`/catalogo/${game.id}`}
            prefetch={prefetch}
            className={styles.panel}
            style={{ "--game-tint": color.deep } as CSSProperties}
            key={game.id}
          >
            <GameImageSlot
              gameId={game.id}
              label={game.label}
              sizeHint="600×800"
              sizes="(max-width: 900px) 50vw, 25vw"
              imageUrl={gameImages[game.id]}
            />
            <div className={styles.panelTint} />
            <div className={styles.panelScrim} />
            <Mark className={styles.mark} style={{ color: color.tint }} />
            <span className={styles.title}>{game.label}</span>
            {startingPriceByGame[game.id] != null && (
              <span className={styles.from}>
                Desde <b>{formatCop(startingPriceByGame[game.id]!)}</b>
                {priceEstimate && (
                  <span className={styles.fromEstimate}>
                    {formatEstimate(startingPriceByGame[game.id]!, priceEstimate)}
                  </span>
                )}
              </span>
            )}
            <span className={styles.cta}>
              Ver productos
              <ChevronRightIcon className={styles.ctaIcon} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

import Link from "next/link";
import type { CSSProperties } from "react";
import styles from "./GameShowcase.module.css";
import { GameImageSlot } from "./GameImageSlot";
import { GAME_MARKS, ChevronRightIcon } from "./icons";
import { GAMES, GAME_COLORS, formatCop, startingPrice } from "@/lib/products";

export function GameShowcase({ gameImages }: { gameImages: Record<string, string> }) {
  return (
    <div className={styles.grid}>
      {GAMES.map((game) => {
        const color = GAME_COLORS[game.id];
        const Mark = GAME_MARKS[game.id];
        return (
          <Link
            href={`/catalogo/${game.id}`}
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
            <span className={styles.from}>
              Desde <b>{formatCop(startingPrice(game.id))}</b>
            </span>
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

import Link from "next/link";
import styles from "./GameShowcase.module.css";
import { GameImageSlot } from "./GameImageSlot";
import { GAMES, formatCop, startingPrice } from "@/lib/products";

export function GameShowcase({ gameImages }: { gameImages: Record<string, string> }) {
  return (
    <div className={styles.grid}>
      {GAMES.map((game) => (
        <Link href={`/catalogo/${game.id}`} className={styles.panel} key={game.id}>
          <GameImageSlot
            gameId={game.id}
            label={game.label}
            sizeHint="600×800"
            sizes="(max-width: 900px) 50vw, 25vw"
            imageUrl={gameImages[game.id]}
          />
          <div className={styles.panelScrim} />
          <span className={styles.title}>{game.label}</span>
          <span className={styles.from}>
            Desde <b>{formatCop(startingPrice(game.id))}</b>
          </span>
        </Link>
      ))}
    </div>
  );
}

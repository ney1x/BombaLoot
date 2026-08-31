import Image from "next/image";
import styles from "./GameImageSlot.module.css";
import { PictureIcon } from "./icons";
import { GAME_COLORS, type GameId } from "@/lib/products";

export function GameImageSlot({
  gameId,
  label,
  sizeHint,
  sizes,
  priority,
  imageUrl,
}: {
  gameId: GameId;
  label: string;
  sizeHint: string;
  sizes?: string;
  priority?: boolean;
  /** Imagen real (producto o banner de juego) — si no llega, se ve el placeholder. */
  imageUrl?: string | null;
}) {
  const src = imageUrl ?? null;

  if (src) {
    return (
      <div className={styles.slot}>
        <Image
          src={src}
          alt={`Arte de ${label}`}
          fill
          sizes={sizes ?? "100vw"}
          className={styles.image}
          priority={priority}
        />
      </div>
    );
  }

  const color = GAME_COLORS[gameId];

  return (
    <div
      className={styles.slot}
      style={{ background: `linear-gradient(155deg, ${color.base}, ${color.deep})` }}
    >
      <div className={styles.placeholder}>
        <div className={styles.frame} />
        <div className={styles.content}>
          <PictureIcon className={styles.icon} />
          <span className={styles.label}>Imagen de {label}</span>
          <span className={styles.hint}>{sizeHint} · pendiente</span>
        </div>
      </div>
    </div>
  );
}

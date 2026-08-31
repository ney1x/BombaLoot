import Link from "next/link";
import styles from "./CatalogProductCard.module.css";
import { GameImageSlot } from "./GameImageSlot";
import { StockBadge } from "./StockBadge";
import { GAME_MARKS } from "./icons";
import { formatCop, type Product } from "@/lib/products";

export function CatalogProductCard({ product }: { product: Product }) {
  const isOut = product.stock === "out";
  const Mark = GAME_MARKS[product.gameId];

  const media = (
    <div className={styles.imageWrap}>
      <GameImageSlot
        gameId={product.gameId}
        label={product.gameLabel}
        sizeHint="480×480"
        sizes="(max-width: 640px) 50vw, (max-width: 1100px) 33vw, 25vw"
        imageUrl={product.imageUrl}
      />
      <span className={styles.badgeSlot}>
        <StockBadge stock={product.stock} lowStockCount={product.lowStockCount} tone="onColor" />
      </span>
      {isOut && (
        <div className={styles.outStamp}>
          <span>AGOTADO</span>
        </div>
      )}
    </div>
  );

  const body = (
    <div className={styles.body}>
      <span className={styles.game}>
        <Mark className={styles.mark} />
        {product.gameShortLabel}
      </span>
      <div className={styles.denomRow}>
        <span className={`${styles.denom} num-display`}>{product.denomination}</span>
        <span className={styles.unit}>{product.unit}</span>
      </div>
      <div className={styles.footer}>
        <span className={`${styles.price} num-display`}>{formatCop(product.priceCop)}</span>
        {!isOut && <span className={styles.cta}>Ver →</span>}
      </div>
    </div>
  );

  if (isOut) {
    return (
      <div
        className={`${styles.card} ${styles.out}`}
        aria-disabled="true"
        aria-label={`${product.gameLabel} ${product.denomination} ${product.unit}, agotado`}
      >
        {media}
        {body}
      </div>
    );
  }

  return (
    <Link
      href={`/catalogo/${product.gameId}?select=${product.id}`}
      className={`${styles.card} ${styles.linked}`}
      aria-label={`${product.gameLabel} ${product.denomination} ${product.unit}, ${formatCop(product.priceCop)}`}
    >
      {media}
      {body}
    </Link>
  );
}

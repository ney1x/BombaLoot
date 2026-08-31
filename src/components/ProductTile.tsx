import Link from "next/link";
import styles from "./ProductTile.module.css";
import { StockBadge } from "./StockBadge";
import { GAME_MARKS } from "./icons";
import { GAME_COLORS, formatCop, type Product } from "@/lib/products";

export function ProductTile({ product }: { product: Product }) {
  const isOut = product.stock === "out";
  const color = GAME_COLORS[product.gameId];
  const Mark = GAME_MARKS[product.gameId];

  const content = (
    <>
      <span className={styles.accentBar} style={{ background: color.base }} />
      <div className={styles.top}>
        <span className={styles.game}>
          <Mark className={styles.mark} style={{ color: color.base }} />
          {product.gameShortLabel}
        </span>
        <StockBadge stock={product.stock} lowStockCount={product.lowStockCount} />
      </div>
      <div className={styles.denomRow}>
        <span className={`${styles.denom} num-display`}>{product.denomination}</span>
        <span className={styles.unit}>{product.unit}</span>
      </div>
      <div className={`${styles.price} num-display`}>{formatCop(product.priceCop)}</div>
      {!isOut && <span className={styles.cta}>Ver producto →</span>}
    </>
  );

  if (isOut) {
    return (
      <div
        className={`${styles.tile} ${styles.out}`}
        aria-disabled="true"
        aria-label={`${product.gameLabel} ${product.denomination} ${product.unit}, agotado`}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      href={`/catalogo/${product.gameId}?select=${product.id}`}
      className={`${styles.tile} ${styles.linked}`}
      aria-label={`${product.gameLabel} ${product.denomination} ${product.unit}, ${formatCop(product.priceCop)}`}
    >
      {content}
    </Link>
  );
}

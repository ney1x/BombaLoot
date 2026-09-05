import Link from "next/link";
import styles from "./CatalogProductCard.module.css";
import { GameImageSlot } from "./GameImageSlot";
import { StockBadge } from "./StockBadge";
import { GAME_MARKS } from "./icons";
import { formatCop, productImageLabel, type Product } from "@/lib/products";
import { formatEstimate, type PriceEstimateContext } from "@/lib/currency";

export function CatalogProductCard({
  product,
  prefetch,
  priceEstimate,
}: {
  product: Product;
  /**
   * `undefined` deja el default de Next (prefetch al entrar en viewport).
   * `CatalogGrid` pasa `false`: con toda la grilla renderizando de una
   * (nada de paginación ni virtualización todavía), cada tarjeta dispara su
   * propio prefetch RSC a `/catalogo/[game]` — medido en producción: 1.86s
   * de DOMContentLoaded en una página cuyo TTFB es 16ms. Mismo patrón que
   * `ProductTile`/`GameShowcase` en la home.
   */
  prefetch?: boolean;
  /** Conversión de referencia según el país del visitante — `null` si no aplica (ver `@/server/services/geo-price`). */
  priceEstimate?: PriceEstimateContext | null;
}) {
  const isOut = product.stock === "out";
  const Mark = GAME_MARKS[product.gameId];

  const media = (
    <div className={styles.imageWrap}>
      <GameImageSlot
        gameId={product.gameId}
        label={productImageLabel(product)}
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
        <span className={styles.priceColumn}>
          <span className={`${styles.price} num-display`}>{formatCop(product.priceCop)}</span>
          {!isOut && priceEstimate && (
            <span className={`${styles.priceEstimate} num-display`}>
              {formatEstimate(product.priceCop, priceEstimate)}
            </span>
          )}
        </span>
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
      prefetch={prefetch}
      className={`${styles.card} ${styles.linked}`}
      aria-label={`${product.gameLabel} ${product.denomination} ${product.unit}, ${formatCop(product.priceCop)}`}
    >
      {media}
      {body}
    </Link>
  );
}

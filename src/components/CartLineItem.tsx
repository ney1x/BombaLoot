import styles from "./CartLineItem.module.css";
import { GameImageSlot } from "./GameImageSlot";
import { GAME_MARKS, TrashIcon } from "./icons";
import { formatCop, type Product } from "@/lib/products";

export function CartLineItem({
  product,
  quantity,
  onIncrease,
  onDecrease,
  onRemove,
  maxQuantity,
}: {
  product: Product;
  quantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
  maxQuantity: number;
}) {
  const Mark = GAME_MARKS[product.gameId];
  const atMax = quantity >= maxQuantity;
  const atMin = quantity <= 0;

  return (
    <div className={styles.line}>
      <div className={styles.imageWrap}>
        <GameImageSlot
          gameId={product.gameId}
          label={product.gameLabel}
          sizeHint="160×160"
          sizes="76px"
          imageUrl={product.imageUrl}
        />
      </div>

      <div className={styles.body}>
        <span className={styles.game}>
          <Mark className={styles.mark} />
          {product.gameShortLabel}
        </span>
        <div className={styles.denomRow}>
          <span className={`${styles.denom} num-display`}>{product.denomination}</span>
          <span className={styles.unit}>{product.unit}</span>
        </div>
        <span className={`${styles.unitPrice} num-display`}>{formatCop(product.priceCop)} c/u</span>
        {product.stock === "out" ? (
          <div className={styles.limitNote}>Ya no hay stock disponible</div>
        ) : (
          product.stock === "low" && atMax && (
            <div className={styles.limitNote}>Solo quedan {maxQuantity} disponibles</div>
          )
        )}
        {atMin && <div className={styles.limitNote}>No se incluye en la compra con cantidad 0</div>}
      </div>

      <div className={styles.right}>
        <div className={styles.stepper}>
          <button
            type="button"
            className={styles.stepperBtn}
            onClick={onDecrease}
            disabled={atMin}
            aria-label="Disminuir cantidad"
          >
            −
          </button>
          <span className={`${styles.stepperValue} num-display`}>{quantity}</span>
          <button
            type="button"
            className={styles.stepperBtn}
            onClick={onIncrease}
            disabled={atMax}
            aria-label="Aumentar cantidad"
          >
            +
          </button>
        </div>
        <span className={`${styles.lineTotal} num-display`}>{formatCop(product.priceCop * quantity)}</span>
        <button type="button" className={styles.removeBtn} onClick={onRemove} aria-label="Eliminar producto">
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

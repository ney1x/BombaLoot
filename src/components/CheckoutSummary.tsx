"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./CheckoutSummary.module.css";
import { GameImageSlot } from "./GameImageSlot";
import { StatusPill } from "./StatusPill";
import { ChevronDownIcon, GAME_MARKS } from "./icons";
import { formatCop, type Product } from "@/lib/products";

export interface CheckoutLine {
  product: Product;
  quantity: number;
  flag?: "agotado" | "insuficiente";
}

export function CheckoutSummary({
  lines,
  subtotalCop,
  discountCop,
  discountLabel,
  totalCop,
}: {
  lines: CheckoutLine[];
  subtotalCop: number;
  discountCop: number;
  discountLabel?: string;
  totalCop: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h2>Resumen del pedido</h2>
        <Link href="/carrito" className={styles.editLink}>
          Editar carrito
        </Link>
      </div>

      <button
        type="button"
        className={styles.toggle}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span>
          {itemCount} {itemCount === 1 ? "producto" : "productos"}
        </span>
        <span className={styles.toggleRight}>
          <span className="num-display">{formatCop(totalCop)}</span>
          <ChevronDownIcon className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`} />
        </span>
      </button>

      <div className={`${styles.content} ${expanded ? styles.contentOpen : ""}`}>
        <div className={styles.lines}>
          {lines.map(({ product, quantity, flag }) => {
            const Mark = GAME_MARKS[product.gameId];
            return (
              <div key={product.id} className={`${styles.line} ${flag ? styles.lineFlagged : ""}`}>
                <div className={styles.imageWrap}>
                  <GameImageSlot
                    gameId={product.gameId}
                    label={product.gameLabel}
                    sizeHint="120×120"
                    sizes="52px"
                    imageUrl={product.imageUrl}
                  />
                </div>
                <div className={styles.lineBody}>
                  <span className={styles.game}>
                    <Mark className={styles.mark} />
                    {product.gameShortLabel}
                  </span>
                  <div className={styles.denomRow}>
                    <span className={`${styles.denom} num-display`}>{product.denomination}</span>
                    <span className={styles.unit}>{product.unit}</span>
                  </div>
                  <div className={`${styles.lineMeta} num-display`}>
                    ×{quantity} · {formatCop(product.priceCop)} c/u
                  </div>
                  {flag === "agotado" && (
                    <div className={styles.flagWrap}>
                      <StatusPill tone="bad">Ya no está disponible</StatusPill>
                    </div>
                  )}
                  {flag === "insuficiente" && (
                    <div className={styles.flagWrap}>
                      <StatusPill tone="warn">
                        {(product.lowStockCount ?? 1) === 1
                          ? "Solo queda 1 disponible"
                          : `Solo quedan ${product.lowStockCount} disponibles`}
                      </StatusPill>
                    </div>
                  )}
                </div>
                <span className={`${styles.linePrice} num-display`}>
                  {formatCop(product.priceCop * quantity)}
                </span>
              </div>
            );
          })}
        </div>

        <div className={styles.totals}>
          <div className={styles.totalRow}>
            <span>Subtotal</span>
            <span className="num-display">{formatCop(subtotalCop)}</span>
          </div>
          <div className={`${styles.totalRow} ${discountCop > 0 ? styles.discount : ""}`}>
            <span>Descuento{discountLabel ? ` (${discountLabel})` : ""}</span>
            <span className="num-display">
              {discountCop > 0 ? `−${formatCop(discountCop)}` : formatCop(0)}
            </span>
          </div>
          <div className={`${styles.totalRow} ${styles.final}`}>
            <span>Total</span>
            <span className="num-display">{formatCop(totalCop)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "./ProductTile.module.css";
import { StockBadge } from "./StockBadge";
import { GAME_MARKS, ChevronRightIcon } from "./icons";
import { GAME_COLORS, formatCop, type Product } from "@/lib/products";

const SPRING = "cubic-bezier(0.22, 1, 0.36, 1)";
const MAX_TILT = 10;

export function ProductTile({
  product,
  prefetch,
  index = 0,
}: {
  product: Product;
  /** Ver el mismo comentario en `GameShowcase` — la home pasa `false`. */
  prefetch?: boolean;
  /** Posición en la grilla — solo controla el delay del stagger de entrada. */
  index?: number;
}) {
  const isOut = product.stock === "out";
  const color = GAME_COLORS[product.gameId];
  const Mark = GAME_MARKS[product.gameId];
  const rootRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add(styles.inView);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);

    const canTilt =
      !isOut &&
      window.matchMedia("(pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!canTilt) return () => io.disconnect();

    const settle = () => {
      el.style.transition = `transform 0.6s ${SPRING}`;
      el.style.transform = "";
      el.style.setProperty("--sheen-o", "0");
    };

    const onMove = (event: PointerEvent) => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width;
        const py = (event.clientY - rect.top) / rect.height;
        const rotateY = (px - 0.5) * MAX_TILT * 2;
        const rotateX = (0.5 - py) * MAX_TILT * 2;
        el.style.transition = "transform 0.08s linear";
        el.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px) scale(1.015)`;
        el.style.setProperty("--mx", `${px * 100}%`);
        el.style.setProperty("--my", `${py * 100}%`);
        el.style.setProperty("--sheen-o", "1");
      });
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", settle);
    el.addEventListener("pointercancel", settle);
    return () => {
      io.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", settle);
      el.removeEventListener("pointercancel", settle);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [isOut]);

  const content = (
    <>
      <span className={styles.glow} aria-hidden="true" />
      <span className={styles.sheen} aria-hidden="true" />
      <div className={styles.top}>
        <span className={styles.game}>
          <Mark className={styles.mark} />
          {product.gameShortLabel}
        </span>
        <StockBadge stock={product.stock} lowStockCount={product.lowStockCount} tone="onColor" />
      </div>
      <div className={styles.denomRow}>
        <span className={`${styles.denom} num-display`}>{product.denomination}</span>
        <span className={styles.unit}>{product.unit}</span>
      </div>
      <div className={`${styles.price} num-display`}>{formatCop(product.priceCop)}</div>
      {!isOut && (
        <span className={styles.cta}>
          Ver producto
          <ChevronRightIcon className={styles.ctaIcon} />
        </span>
      )}
    </>
  );

  const rootStyle = {
    "--g-deep": color.deep,
    "--g-base": color.base,
    "--g-tint": color.tint,
    "--stagger-i": index,
  } as React.CSSProperties;

  if (isOut) {
    return (
      <div
        ref={rootRef as React.RefObject<HTMLDivElement>}
        className={`${styles.tile} ${styles.out}`}
        style={rootStyle}
        aria-disabled="true"
        aria-label={`${product.gameLabel} ${product.denomination} ${product.unit}, agotado`}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      ref={rootRef as React.RefObject<HTMLAnchorElement>}
      href={`/catalogo/${product.gameId}?select=${product.id}`}
      prefetch={prefetch}
      className={`${styles.tile} ${styles.linked}`}
      style={rootStyle}
      aria-label={`${product.gameLabel} ${product.denomination} ${product.unit}, ${formatCop(product.priceCop)}`}
    >
      {content}
    </Link>
  );
}

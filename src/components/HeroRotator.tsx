"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./HeroRotator.module.css";
import { GameImageSlot } from "./GameImageSlot";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { formatCop, type Product } from "@/lib/products";

const ROTATE_MS = 4500;

export function HeroRotator({
  products,
  gameImages,
}: {
  products: Product[];
  gameImages: Record<string, string>;
}) {
  const [index, setIndex] = useState(0);
  const pausedRef = useRef(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || products.length <= 1) return;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setIndex((i) => (i + 1) % products.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [reducedMotion, products.length]);

  const product = products[index];

  function pause() {
    pausedRef.current = true;
  }

  function resume() {
    pausedRef.current = false;
  }

  return (
    <>
      {/*
       * El titular va antes del carrusel a propósito: un visitante nuevo
       * necesita saber qué es este sitio antes de ver un producto puntual
       * rotando — lo general antes de lo específico. Antes estaba después
       * del banner, así que primero veías "VALORANT 575 VP" sin contexto.
       */}
      <div className={styles.intro}>
        <h1>Tu código digital, al instante.</h1>
        <p>
          Elegí la denominación exacta que necesitás, pagá de forma segura y
          recibí el código en tu pedido apenas confirmamos el pago con el
          proveedor — sin cuenta obligatoria.
        </p>
        <div className={styles.actions}>
          <Link href="/catalogo" className="btn btnPrimary">
            Ver catálogo completo
          </Link>
          <a href="#como-funciona" className="btn btnQuiet">
            Cómo funciona
          </a>
        </div>
      </div>

      <section
        className={styles.banner}
        onMouseEnter={pause}
        onMouseLeave={resume}
        onTouchStart={pause}
        onTouchEnd={resume}
        aria-roledescription="carrusel"
        aria-label="Productos destacados"
      >
        <div className={styles.bg} key={product.id}>
          <GameImageSlot
            gameId={product.gameId}
            label={product.gameLabel}
            sizeHint="1600×670"
            sizes="100vw"
            priority
            imageUrl={gameImages[product.gameId]}
          />
        </div>
        <div className={styles.scrim} />

        <div className={styles.overlay}>
          <div className={styles.info} key={`${product.id}-info`}>
            <div className={styles.game}>{product.gameLabel}</div>
            <div className={styles.denomRow}>
              <span className={`${styles.denom} num-display`}>{product.denomination}</span>
              <span className={styles.unit}>{product.unit}</span>
            </div>
            <div className={`${styles.price} num-display`}>{formatCop(product.priceCop)}</div>
            <Link href={`/catalogo/${product.gameId}?select=${product.id}`} className={styles.cta}>
              Comprar ahora
            </Link>
          </div>

          <div className={styles.footer}>
            <div className={styles.dots} role="tablist" aria-label="Elegir producto destacado">
              {products.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`${p.gameLabel} — ${p.denomination} ${p.unit}`}
                  className={`${styles.dot} ${i === index ? styles.dotActive : ""}`}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

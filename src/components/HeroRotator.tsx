"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./HeroRotator.module.css";
import { GameImageSlot } from "./GameImageSlot";
import { LightningIcon, ShieldCheckIcon, UserIcon } from "./icons";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { formatCop, type Product } from "@/lib/products";

const BENEFITS = [
  { icon: LightningIcon, title: "Entrega instantánea", body: "Recibí tu código al instante" },
  { icon: ShieldCheckIcon, title: "Pagos seguros", body: "Protegemos tu compra" },
  { icon: UserIcon, title: "Sin cuenta obligatoria", body: "Comprá sin registrarte" },
];

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
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
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

  const SWIPE_THRESHOLD_PX = 40;

  /*
   * El carrusel ya pausaba en touch para no pelear con el dedo mientras se
   * interactúa, pero nunca dejaba deslizar — en mobile la única forma de
   * cambiar de producto era acertarle a un dot de 26×4px. Un swipe
   * horizontal cambia de producto; uno mayormente vertical se deja pasar
   * (así el scroll de la página nunca queda atrapado).
   */
  function handleTouchStart(e: React.TouchEvent) {
    pause();
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  }

  function handleTouchEnd() {
    if (products.length > 1 && Math.abs(touchDeltaX.current) > SWIPE_THRESHOLD_PX) {
      const direction = touchDeltaX.current < 0 ? 1 : -1;
      setIndex((i) => (i + direction + products.length) % products.length);
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
    resume();
  }

  return (
    <div className={styles.hero}>
      {/*
       * El titular va antes del carrusel a propósito: un visitante nuevo
       * necesita saber qué es este sitio antes de ver un producto puntual
       * rotando — lo general antes de lo específico.
       */}
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Códigos digitales · Entrega instantánea</p>
        <h1>
          <span className={styles.headLine}>Tu código digital,</span>
          <span className={`${styles.headLine} ${styles.headAccent}`}>al instante.</span>
        </h1>
        <p className={styles.lede}>
          Elegí la denominación exacta que necesitás, pagá de forma segura y
          recibí el código en tu pedido apenas confirmamos el pago con el
          proveedor — sin cuenta obligatoria.
        </p>
        <div className={styles.actions}>
          <Link href="/catalogo" className={`btn ${styles.ctaPrimary}`}>
            Ver catálogo completo
            <ChevronRight />
          </Link>
          <a href="#como-funciona" className={`btn ${styles.ctaSecondary}`}>
            <PlayCircle />
            Cómo funciona
          </a>
        </div>
        <ul className={styles.benefits}>
          {BENEFITS.map((benefit) => (
            <li key={benefit.title}>
              <benefit.icon className={styles.benefitIcon} />
              <div>
                <p className={styles.benefitTitle}>{benefit.title}</p>
                <p className={styles.benefitBody}>{benefit.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <section
        className={styles.banner}
        onMouseEnter={pause}
        onMouseLeave={resume}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        aria-roledescription="carrusel"
        aria-label="Productos destacados"
      >
        <div className={styles.bg} key={product.id}>
          <GameImageSlot
            gameId={product.gameId}
            label={product.gameLabel}
            sizeHint="1600×670"
            sizes="(max-width: 900px) 100vw, 44vw"
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
          </div>

          <Link href={`/catalogo/${product.gameId}?select=${product.id}`} className={styles.cta}>
            Comprar ahora
            <ChevronRight />
          </Link>

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
    </div>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function PlayCircle() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m10.3 9 4.4 3-4.4 3V9Z" />
    </svg>
  );
}

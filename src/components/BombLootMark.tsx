import { useId, type SVGProps } from "react";
import styles from "./BombLootMark.module.css";

/**
 * Marca de BombaLoot — misma silueta clásica (cuerpo redondo + tapa + mecha
 * + chispa, un solo contorno cerrado, sin letras escondidas), pero con el
 * cuerpo esférico real: relleno oscuro con degradé sutil (arriba-izquierda
 * más claro) para que se sienta con volumen, más un borde de luz en degradé
 * violeta→magenta→naranja — la firma de color de la marca — en vez de un
 * contorno plano. Eso es lo que hace que no lea como "una bomba cualquiera":
 * el rim-light, no una ilustración con más detalle. La chispa creció y
 * ahora tiene un núcleo blanco caliente + brillo grande detrás, más
 * dramática que antes. Sigue siendo geometría propia (nada de blur
 * fotorrealista ni sombreado complejo) para no perder legibilidad a 16px
 * de favicon. Colores en variables CSS (`BombLootMark.module.css`).
 */
export function BombLootMark({
  className,
  lit,
  ...props
}: SVGProps<SVGSVGElement> & { lit?: boolean }) {
  const uid = useId();
  const glowFilterId = `bombloot-glow-${uid}`;
  const rimGradientId = `bombloot-rim-${uid}`;
  const bodyGradientId = `bombloot-body-${uid}`;

  return (
    <svg
      viewBox="0 0 32 32"
      className={`${styles.mark} ${lit ? styles.lit : ""} ${className ?? ""}`}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <filter id={glowFilterId} x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
        <linearGradient id={rimGradientId} x1="15%" y1="5%" x2="90%" y2="95%">
          <stop offset="0%" className={styles.rimStop1} />
          <stop offset="55%" className={styles.rimStop2} />
          <stop offset="100%" className={styles.rimStop3} />
        </linearGradient>
        <radialGradient id={bodyGradientId} cx="34%" cy="30%" r="75%">
          <stop offset="0%" className={styles.bodyStop1} />
          <stop offset="100%" className={styles.bodyStop2} />
        </radialGradient>
      </defs>

      {/*
        El dibujo deja bastante aire vacío a los costados del cuerpo dentro
        de su propio viewBox — el ícono va después de la palabra, así que
        acá interesa el margen IZQUIERDO (pegado a la "t" de loot), no el
        derecho. Correrlo con un solo transform, sin tocar la geometría.
      */}
      <g transform="translate(-4 0)">
        {/* mecha — una sola curva, corta y directa */}
        <path d="M16.5 7 C 19 4.6 22.2 3.1 25.6 2" className={styles.fuse} />

        {/* brillo tras la chispa — pulsa junto con ella */}
        <circle cx="25.8" cy="1.7" r="5" className={styles.glow} filter={`url(#${glowFilterId})`} />

        {/* chispa: destello grande de cuatro puntas con núcleo caliente —
            el rasgo propio de la marca, agrandado para que pegue fuerte */}
        <path
          d="M25.8 -3.6 C 26.6 -0.3 27.4 0.8 31.2 1.7 C 27.4 2.6 26.6 3.7 25.8 7 C 25 3.7 24.2 2.6 20.4 1.7 C 24.2 0.8 25 -0.3 25.8 -3.6 Z"
          className={`${styles.spark} ${styles.sparkMain}`}
        />
        <circle cx="25.8" cy="1.7" r="1.3" className={`${styles.spark} ${styles.sparkCore}`} />
        <circle cx="31" cy="6.2" r="1.1" className={`${styles.spark} ${styles.sparkDot}`} />
        <circle cx="21" cy="-1.8" r="0.7" className={`${styles.spark} ${styles.sparkFleck}`} />

        {/* cuerpo + tapa: un solo contorno cerrado, sin costuras — relleno
            esférico + borde en degradé en vez de sombreado plano */}
        <path
          d="M12.8 11 A 10 10 0 1 0 19.2 11 C 19.2 9 19 7.2 17.7 7 L 14.3 7 C 13 7.2 12.8 9 12.8 11 Z"
          fill={`url(#${bodyGradientId})`}
          stroke={`url(#${rimGradientId})`}
          className={styles.body}
        />

        {/* brillo — el reflejo que vende "esfera pulida" sin sombreado complejo */}
        <ellipse
          cx="12.6" cy="14.2" rx="2.1" ry="3.4"
          transform="rotate(-24 12.6 14.2)"
          className={styles.gloss}
        />
      </g>
    </svg>
  );
}

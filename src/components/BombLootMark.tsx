import type { SVGProps } from "react";
import styles from "./BombLootMark.module.css";

/**
 * Marca de bombaloot — bomba facetada + mecha con chispa de "loot" en
 * píxeles. Geometría propia (polígonos), no una ilustración con sombreado:
 * el cuerpo son 7 triángulos rellenos desde el centro, separados por líneas
 * finas, como una gema tallada. Los tonos del cuerpo y la chispa salen de
 * variables CSS (`BombLootMark.module.css`) para invertir solos entre modo
 * claro y oscuro — nunca un PNG plano con un color ya cocinado adentro.
 */
export function BombLootMark({
  className,
  lit,
  ...props
}: SVGProps<SVGSVGElement> & { lit?: boolean }) {
  return (
    <svg
      viewBox="0 0 40 34"
      className={`${styles.mark} ${lit ? styles.lit : ""} ${className ?? ""}`}
      aria-hidden="true"
      {...props}
    >
      {/* mecha */}
      <path d="M16 10 C 20 5 25 3 29 4" className={styles.fuse} />

      {/* chispa: cubos de "loot" en la punta de la mecha */}
      <rect x="29.4" y="0.4" width="3.2" height="3.2" transform="rotate(15 31 2)" className={styles.spark} />
      <rect x="34.8" y="3.8" width="2.4" height="2.4" transform="rotate(-10 36 5)" className={styles.spark} />
      <rect x="36.1" y="0.1" width="1.8" height="1.8" transform="rotate(25 37 1)" className={`${styles.spark} ${styles.sparkDim}`} />

      {/* cuerpo facetado */}
      <g className={styles.body}>
        <path d="M16 22 16 10 25 13 Z" className={styles.f1} />
        <path d="M16 22 25 13 28 22 Z" className={styles.f2} />
        <path d="M16 22 28 22 21 30 Z" className={styles.f3} />
        <path d="M16 22 21 30 11 30 Z" className={styles.f2} />
        <path d="M16 22 11 30 4 22 Z" className={styles.f1} />
        <path d="M16 22 4 22 7 13 Z" className={styles.f3} />
        <path d="M16 22 7 13 16 10 Z" className={styles.f2} />
      </g>
      <path d="M16 10 25 13 28 22 21 30 11 30 4 22 7 13 Z" className={styles.outline} />
    </svg>
  );
}

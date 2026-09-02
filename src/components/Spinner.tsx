import styles from "./Spinner.module.css";

/**
 * El círculo de carga azul del sitio — un solo lugar para no repetir el
 * mismo anillo con retoques distintos en cada pantalla que espera algo
 * (navegación entre páginas, redirección a pago, lo que siga).
 */
export function Spinner({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span
      className={`${styles.spinner} ${className ?? ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
      data-motion="essential"
    />
  );
}

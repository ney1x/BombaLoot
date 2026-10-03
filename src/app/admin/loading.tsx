import styles from "./loading.module.css";

/**
 * Mismo mecanismo que `(storefront)/loading.tsx` — Suspense boundary nativa
 * de Next.js en la raíz de `/admin`, cubre cualquier página del panel sin
 * `loading.tsx` propio (todas, hoy). Solo se pinta si el Server Component
 * tarda de verdad; nunca a la fuerza.
 */
export default function AdminLoading() {
  return (
    <div className={styles.wrap} role="status" aria-live="polite" aria-label="Cargando">
      <span className={styles.spinner} />
      <span className={styles.label}>Cargando…</span>
    </div>
  );
}

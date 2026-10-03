import { Spinner } from "@/components/Spinner";
import styles from "./loading.module.css";

/**
 * Next.js la muestra sola mientras el Server Component de la página carga
 * datos — nunca a la fuerza ni con un mínimo de tiempo fijo: si la
 * respuesta es rápida, esto ni se llega a pintar. Cubre cualquier ruta de
 * `(storefront)` sin `loading.tsx` propio (todas, hoy) porque vive en la
 * raíz del grupo — un solo archivo, toda la tienda.
 *
 * Ocupa el viewport completo a propósito: el `Footer` del layout sigue
 * montado justo debajo (esto solo reemplaza `children`), pero a 100vh
 * queda fuera de vista mientras carga — sin eso aparecía pegado abajo del
 * spinner y se sentía un salto brusco apenas entraba el contenido real.
 */
export default function StorefrontLoading() {
  return (
    <div className={styles.wrap} role="status" aria-live="polite" aria-label="Cargando">
      <Spinner />
    </div>
  );
}

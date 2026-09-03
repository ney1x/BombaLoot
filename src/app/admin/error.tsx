"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./error.module.css";
import { AlertIcon } from "@/components/icons";

/**
 * Error boundary de todo `/admin/*` (Next.js lo monta automáticamente en
 * cualquier fallo de render o de datos dentro del segmento — incluye lo que
 * tira `await` en un Server Component, como las queries del dashboard).
 * Sin este archivo, ese mismo fallo caía en la pantalla de error genérica
 * de Next, sin estilo ni "Reintentar", justo en el panel que el staff mira
 * para saber si algo anda mal.
 *
 * `reset()` solo no alcanza: verificado en vivo que reutiliza la entrada ya
 * cacheada del Router Cache del cliente en vez de volver a pedirle datos al
 * servidor (el log del servidor no registraba un segundo intento tras el
 * primer click, aunque la causa real ya estuviera resuelta). `router.refresh()`
 * invalida esa cache y fuerza el refetch real; `reset()` después limpia el
 * estado del boundary para que se muestre el resultado.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error("[admin] error de render:", error);
  }, [error]);

  return (
    <div className={styles.wrap} role="alert">
      <span className={styles.icon}>
        <AlertIcon />
      </span>
      <h1 className={styles.title}>Algo falló cargando esta página</h1>
      <p className={styles.subtitle}>
        El error ya quedó registrado. Podés reintentar — si sigue pasando, es un buen momento para
        avisar en el canal técnico.
      </p>
      <button
        type="button"
        className={styles.retry}
        onClick={() => {
          router.refresh();
          reset();
        }}
      >
        Reintentar
      </button>
    </div>
  );
}

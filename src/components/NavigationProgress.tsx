"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./NavigationProgress.module.css";

/** Recién a partir de acá se muestra — evita el parpadeo en la mayoría de las navegaciones, que resuelven más rápido que esto. */
const SHOW_DELAY_MS = 150;
/** Salvavidas: si una navegación nunca resuelve (error de red, lo que sea), la barra no queda pegada para siempre. */
const SAFETY_TIMEOUT_MS = 10_000;
/** Cuánto dura el "salta a 100% y se desvanece" antes de resetear a 0% para la próxima. */
const DONE_RESET_MS = 260;

type BarStatus = "idle" | "loading" | "done";

/**
 * El App Router no tiene un evento global de "arrancó una navegación" —
 * `loading.tsx` cubre la demora del lado del SERVIDOR (streaming: manda el
 * fallback rápido, después el contenido), no el viaje de red hasta que el
 * pedido llega ahí. Confirmado en vivo en esta sesión: incluso una página
 * con datos reales (`/catalogo/[game]`, consulta a Postgres) se queda
 * congelada sin ningún indicador bajo demora de red — no es un problema
 * específico de ninguna página en particular.
 *
 * Delegado a un único listener de click en `document` — no toca ningún
 * `<Link>` existente en ningún archivo. Cubre navegaciones que arrancan de
 * un click en un `<a>` real (todo `<Link>` de Next renderiza uno: header,
 * cards, footer). NO cubre un `router.push()` disparado sin click de por
 * medio (ej. el redirect después de crear un ticket de soporte) — la
 * minoría de las navegaciones del sitio, aceptado como límite de este
 * mecanismo.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BarStatus>("idle");
  const pendingRef = useRef(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }

  // Termina apenas la URL real cambia — en el App Router eso pasa junto
  // con el swap del contenido nuevo, nunca antes (no es optimista al
  // click), así que es la señal correcta de "la navegación resolvió".
  useEffect(() => {
    if (!pendingRef.current && status === "idle") return;
    pendingRef.current = false;
    clearTimers();
    setStatus((prev) => (prev === "loading" ? "done" : "idle"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // "done" es un flash breve (salta a 100%, se desvanece) — después resetea sola a 0% para la próxima.
  useEffect(() => {
    if (status !== "done") return;
    const t = setTimeout(() => setStatus("idle"), DONE_RESET_MS);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return; // se abre en pestaña nueva
      if (anchor.hasAttribute("download")) return;

      const rawHref = anchor.getAttribute("href");
      if (!rawHref || !rawHref.startsWith("/")) return; // solo interno — descarta externos, mailto:, #ancla suelta

      const url = new URL(anchor.href);
      const destination = `${url.pathname}${url.search}`;
      const currentSearch = searchParams.toString();
      const current = `${pathname}${currentSearch ? `?${currentSearch}` : ""}`;
      if (destination === current) return; // misma página (o solo cambia el hash) — nada que esperar

      pendingRef.current = true;
      clearTimers();
      showTimerRef.current = setTimeout(() => {
        if (pendingRef.current) setStatus("loading");
      }, SHOW_DELAY_MS);
      safetyTimerRef.current = setTimeout(() => {
        pendingRef.current = false;
        setStatus("idle");
      }, SAFETY_TIMEOUT_MS);
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      clearTimers();
    };
  }, [pathname, searchParams]);

  return <div className={`${styles.bar} ${status !== "idle" ? styles[status] : ""}`} aria-hidden="true" />;
}

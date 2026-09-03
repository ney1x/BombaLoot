"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./AssistantLauncher.module.css";
import { ChevronRightIcon, CloseIcon, HeadsetIcon } from "./icons";
import { SUPPORT_CATEGORIES, type SupportCategory } from "@/lib/support";

/** Subconjunto de motivos más comunes — el resto sigue disponible en /ayuda vía "Otro motivo". */
const QUICK_ACTIONS: SupportCategory[] = ["NO_CODE", "ORDER_ISSUE", "CODE_INVALID", "LOST_ORDER_NUMBER"];

/**
 * Lanzador flotante presente en todo el storefront — saludo fijo + accesos
 * directos a los motivos de contacto más comunes, que precargan la
 * categoría en `/ayuda` (ver `motivo` en `SupportTicketForm`). No es un
 * asistente con IA: reusa el sistema de tickets que ya existe, solo le saca
 * un paso al camino más frecuente ("no recibí mi código" es, por lejos, el
 * motivo más común — ver `admin/soporte`).
 */
export function AssistantLauncher() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Redundante en /ayuda (ya es la página de contacto) y fuera de lugar en
  // pleno pago — un widget flotante interrumpiendo el checkout es el tipo
  // de distracción que el resto del sitio evita a propósito ahí.
  const hidden = pathname.startsWith("/ayuda") || pathname.startsWith("/checkout");
  if (hidden) return null;

  function goTo(category: SupportCategory) {
    setOpen(false);
    router.push(`/ayuda?motivo=${category}`);
  }

  return (
    <>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Asistente de ayuda">
          <div className={styles.header}>
            <h2>¿En qué te ayudamos?</h2>
            <button type="button" className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Cerrar">
              <CloseIcon />
            </button>
          </div>
          <div className={styles.body}>
            <p className={styles.greeting}>
              ¡Hola! Elegí lo que más se parece a tu situación y te llevamos directo al formulario, ya con el
              motivo elegido.
            </p>
            <div className={styles.quickActions}>
              {QUICK_ACTIONS.map((value) => {
                const label = SUPPORT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
                return (
                  <button key={value} type="button" className={styles.quickAction} onClick={() => goTo(value)}>
                    {label}
                    <ChevronRightIcon />
                  </button>
                );
              })}
            </div>
          </div>
          <div className={styles.footer}>
            <Link href="/ayuda" className={styles.footerLink} onClick={() => setOpen(false)}>
              Ver todos los motivos →
            </Link>
          </div>
        </div>
      )}

      <button
        type="button"
        className={styles.launcher}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Cerrar ayuda" : "Abrir ayuda"}
        aria-expanded={open}
      >
        {open ? <CloseIcon /> : <HeadsetIcon />}
      </button>
    </>
  );
}

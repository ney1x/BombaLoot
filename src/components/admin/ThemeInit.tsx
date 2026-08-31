"use client";

import { useEffect } from "react";

/**
 * Reemplaza al `<Script strategy="beforeInteractive">` que usa el layout
 * del storefront. Ese patrón asume que su layout es el ÚNICO root layout
 * de la app; con dos root layouts (storefront + admin, ver
 * `admin/layout.tsx`), un `beforeInteractive` inyectado en el admin
 * dispara "Encountered a script tag while rendering React component" en
 * cuanto hay una navegación cliente-a-cliente dentro de `/admin/*` — Next
 * ya insertó el `<script>` real una vez y no espera volver a
 * "renderizarlo" como elemento React. Un efecto normal, con el mismo
 * costo de un frame de flash aceptable en una herramienta interna, evita
 * el problema de raíz.
 */
export function ThemeInit() {
  useEffect(() => {
    try {
      const stored = localStorage.getItem("loadout-theme");
      if (stored === "dark") document.documentElement.dataset.theme = "dark";
    } catch {}
  }, []);

  return null;
}

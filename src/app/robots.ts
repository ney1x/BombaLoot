import type { MetadataRoute } from "next";

/**
 * `/robots.txt`. Bloquea todo lo que no tiene valor de indexación o es
 * privado por naturaleza (panel admin, API, cuenta, checkout, tickets) —
 * el resto (home, catálogo, categorías por juego, páginas de confianza)
 * queda abierto por default.
 *
 * Auditado contra el árbol de rutas completo de `src/app/(storefront)`: cada
 * entrada acá es un prefijo real de una página privada/transaccional, y
 * ninguna página pública (`/`, `/catalogo`, `/catalogo/[game]`, `/faq`,
 * `/ayuda`, `/terminos`, `/privacidad`, `/cookies`) empieza con ninguno de
 * estos prefijos — `tests/seo.test.ts` lo verifica para que un cambio futuro
 * no rompa esa garantía en silencio.
 *
 * Las dos últimas entradas no son páginas nuevas, son variantes con
 * querystring de `/catalogo` que ya existen (`?game=` en `/catalogo`,
 * `?select=` en `/catalogo/[game]`) — mismo contenido que la URL canónica
 * sin parámetros, así que rastrearlas aparte solo diluye señal de SEO en
 * contenido duplicado.
 */
export default function robots(): MetadataRoute.Robots {
  // Adentro de la función, no a nivel de módulo — mismo criterio que
  // `redirectUri()` en `google.ts` y cada otro uso de APP_URL en el
  // proyecto: un `const` de módulo se congela en el valor que tenía
  // `process.env` al importar, no en el de cuando de verdad se llama.
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api",
        "/checkout",
        "/carrito",
        "/cuenta",
        "/pedido",
        "/ayuda/ticket",
        "/invitacion-admin",
        "/catalogo?",
        "/catalogo/*?",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

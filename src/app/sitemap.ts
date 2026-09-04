import type { MetadataRoute } from "next";
import { GAMES } from "@/lib/products";

interface Entry {
  path: string;
  priority: number;
  changeFrequency: "daily" | "monthly" | "yearly";
}

const STATIC_PAGES: Entry[] = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "/catalogo", priority: 0.9, changeFrequency: "daily" },
  { path: "/faq", priority: 0.3, changeFrequency: "monthly" },
  { path: "/ayuda", priority: 0.3, changeFrequency: "monthly" },
  { path: "/terminos", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacidad", priority: 0.2, changeFrequency: "yearly" },
  { path: "/cookies", priority: 0.2, changeFrequency: "yearly" },
];

/**
 * `/sitemap.xml`. Solo páginas públicas, canónicas e indexables — el
 * catálogo por juego (`GAMES`, estático, sin ir a la base) más el
 * contenido de confianza/soporte que ya lista `robots.ts` como permitido.
 * Nada de cuenta/checkout/pedidos: son privados o dinámicos por usuario,
 * sin sentido en un sitemap.
 *
 * No hay página de producto individual más allá de `/catalogo/[game]`
 * (auditado contra `src/app/(storefront)`: cada denominación se lista
 * inline ahí, no tiene URL propia) — el día que exista, entra acá. Cada
 * URL es la canónica sin querystring (nunca `?game=`/`?select=`, que
 * `robots.ts` bloquea justamente por ser el mismo contenido duplicado) y
 * aparece una sola vez — `tests/seo.test.ts` verifica ambas cosas.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // Adentro de la función, no a nivel de módulo — ver el comentario
  // equivalente en `robots.ts`.
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

  const gamePages: Entry[] = GAMES.map((g) => ({
    path: `/catalogo/${g.id}`,
    priority: 0.8,
    changeFrequency: "daily",
  }));

  const lastModified = new Date();
  return [...STATIC_PAGES, ...gamePages].map((entry) => ({
    url: `${baseUrl}${entry.path}`,
    lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}

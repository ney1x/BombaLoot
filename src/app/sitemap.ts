import type { MetadataRoute } from "next";
import { GAMES } from "@/lib/products";
import { getDb } from "@/server/db/client";
import { getGameLastUpdatedMap } from "@/server/services/catalog";

interface Entry {
  path: string;
  priority: number;
  changeFrequency: "daily" | "monthly" | "yearly";
  lastModified: Date;
}

/**
 * Fechas fijas a mano para páginas sin fecha en la base — no hay
 * `updated_at` de FAQ/términos/privacidad/cookies en ningún lado; bumpear
 * esto a mano es el precio de que estas páginas no dependan de la DB.
 * Actualizar la fecha correspondiente solo cuando de verdad se edita el
 * copy de esa página, no en cada deploy.
 */
const STATIC_PAGE_LASTMOD = new Date("2026-09-06T00:00:00.000Z");

/**
 * No se toca la DB acá — no hay `updated_at` de "el catálogo en general"
 * más allá de sus productos, así que el máximo del mapa por juego
 * (`getGameLastUpdatedMap`) es la mejor aproximación sin agregar una
 * segunda query.
 */
function overallLastModified(byGame: Map<string, Date>): Date {
  const dates = [...byGame.values()];
  if (dates.length === 0) return STATIC_PAGE_LASTMOD;
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

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
 *
 * `lastModified` sale de `products.updated_at` real (una sola query
 * agrupada por juego, `getGameLastUpdatedMap`) en vez de `new Date()` en
 * cada request — antes esa señal para Google decía "cambió ahora mismo"
 * siempre, sin importar si de verdad cambió algo. Si la query falla (blip
 * de red a la DB durante un crawl), el catch cae a `STATIC_PAGE_LASTMOD`
 * en vez de tirar 500 — un sitemap roto es peor que uno con un `lastmod`
 * de respaldo.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Adentro de la función, no a nivel de módulo — ver el comentario
  // equivalente en `robots.ts`.
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

  const byGame = await getGameLastUpdatedMap(getDb()).catch(() => new Map<string, Date>());
  const catalogLastModified = overallLastModified(byGame);

  const staticEntries: Entry[] = [
    { path: "", priority: 1, changeFrequency: "daily", lastModified: catalogLastModified },
    { path: "/catalogo", priority: 0.9, changeFrequency: "daily", lastModified: catalogLastModified },
    { path: "/faq", priority: 0.3, changeFrequency: "monthly", lastModified: STATIC_PAGE_LASTMOD },
    { path: "/ayuda", priority: 0.3, changeFrequency: "monthly", lastModified: STATIC_PAGE_LASTMOD },
    { path: "/terminos", priority: 0.2, changeFrequency: "yearly", lastModified: STATIC_PAGE_LASTMOD },
    { path: "/privacidad", priority: 0.2, changeFrequency: "yearly", lastModified: STATIC_PAGE_LASTMOD },
    { path: "/cookies", priority: 0.2, changeFrequency: "yearly", lastModified: STATIC_PAGE_LASTMOD },
  ];

  const gamePages: Entry[] = GAMES.map((g) => ({
    path: `/catalogo/${g.id}`,
    priority: 0.8,
    changeFrequency: "daily",
    lastModified: byGame.get(g.id) ?? catalogLastModified,
  }));

  return [...staticEntries, ...gamePages].map((entry) => ({
    url: `${baseUrl}${entry.path}`,
    lastModified: entry.lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}

/** Evita pegarle a la DB en cada crawl — un catálogo que no cambia cada hora no necesita `lastmod` más fino que esto. */
export const revalidate = 3600;

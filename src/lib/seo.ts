import type { Metadata } from "next";
import type { Product } from "./products";

export const SITE_NAME = "BombaLoot";

/** `public/og-image.png` — mismo diseño que generaba `opengraph-image.tsx` (ver por qué es estática, abajo). */
const OG_IMAGE = { url: "/og-image.png", width: 1200, height: 630 };

/**
 * Arma el bloque completo de metadata (title, description, canonical, Open
 * Graph, Twitter) para una página pública — evita repetir los mismos 9
 * campos en cada `page.tsx` (Fase 2: cada página importante los necesita
 * todos, no solo `title`).
 *
 * `path` es relativo (`"/catalogo"`, `"/catalogo/valorant"`, `""` para
 * home) — Next lo resuelve contra `metadataBase` (declarado una sola vez en
 * el layout raíz del storefront) para armar la URL absoluta, así que nunca
 * hace falta tocar el dominio acá ni repetirlo por página.
 *
 * `OG_IMAGE` va explícito acá, no por convención de archivo
 * (`opengraph-image.tsx`, como en la Fase 1). Se probó y la convención de
 * archivo NO se hereda cuando una página define su propio objeto
 * `openGraph` — Next lo trata como reemplazo completo del de arriba, no
 * merge campo por campo (confirmado en vivo: sin esto, cada página con
 * title/description propios se queda sin imagen). Como la marca es una
 * sola imagen para las nueve páginas, más simple tenerla de una vez como
 * archivo estático que pelear la herencia — `opengraph-image.tsx` quedó
 * eliminado.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: "es_CO",
      type: "website",
      images: [{ ...OG_IMAGE, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

export interface BreadcrumbItem {
  name: string;
  /** Relativa (`"/catalogo"`, `""` para home) — mismo criterio que `path` en `pageMetadata`. */
  path: string;
}

/**
 * Serializa datos para insertar en un
 * `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ... }} />`.
 * `JSON.stringify` por sí solo NO escapa `<`/`>`/`&` — un valor que
 * contenga `</script>` (ej. `denomination`/`unit` de un producto, texto
 * libre que carga un admin) cierra el script real ahí mismo y deja correr
 * lo que sigue como HTML/JS nuevo, para cualquier visitante público del
 * catálogo (hallazgo de la auditoría de seguridad, 2026-09-04 — XSS
 * almacenado). Todos los builders de JSON-LD de este archivo pasan por
 * acá, sin excepción, en vez de decidir caso por caso si su fuente de
 * datos "hoy" es fija o viene de la base — la próxima función que se
 * agregue queda cubierta gratis.
 *
 * Los `\uXXXX` de abajo son escapes JSON válidos: cualquier parser de
 * JSON (incluido el de Google) los decodifica de vuelta al carácter
 * original, así que el dato en sí no cambia — solo cómo queda embebido
 * en el HTML alrededor.
 */
function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/**
 * JSON-LD `BreadcrumbList` (schema.org) — la forma explícita, legible por
 * máquina, de decirle a Google la jerarquía Home → Catálogo → Juego que
 * pide la Fase 5. Los links reales (`<Link>`) ya alcanzan para que Google
 * la DESCUBRA rastreando; esto es para que la ENTIENDA sin tener que
 * inferirla del layout visual. A diferencia de `pageMetadata`, acá SÍ hace
 * falta la URL absoluta — es el formato que exige schema.org, no algo que
 * Next resuelva por `metadataBase`.
 */
export function breadcrumbJsonLd(items: BreadcrumbItem[]): string {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${baseUrl}${item.path}`,
    })),
  });
}

/**
 * `Organization` + `WebSite` (Fase 8) — solo en home (`/`), no en cada
 * página: son la identidad del sitio entero, repetirlos en las 9 páginas
 * no suma nada y es justo la duplicación de datos que pidió evitar esta
 * fase.
 *
 * Lo que NO lleva, a propósito, porque no existe de verdad:
 * - `logo`: no hay un archivo de logo real (`/og-image.png` es una tarjeta
 *   social 1200×630 con texto, no una marca — usarla como `logo` sería
 *   mentirle a Google sobre qué es esa imagen).
 * - `sameAs` (redes sociales): ningún perfil verificado en el código.
 * - `WebSite.potentialAction` (SearchAction, la "sitelinks search box"):
 *   la búsqueda del navbar (`Header.tsx`) no arma ninguna URL — no navega
 *   a ningún resultado, solo abre un dropdown. Declarar un SearchAction
 *   sin una URL que de verdad busque rompería la sitelinks search box de
 *   Google en producción.
 * - `contactPoint` sin teléfono/email: no existe ninguno público en el
 *   sitio (soporte es por ticket, `/ayuda`) — el `url` del contactPoint
 *   apunta ahí, nada inventado.
 */
export function organizationJsonLd(): string {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: baseUrl,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: `${baseUrl}/ayuda`,
    },
  });
}

export function websiteJsonLd(): string {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: baseUrl,
  });
}

export interface JsonLdProduct {
  /** `product.id` real (ej. "valorant-565") — no un id inventado. */
  id: string;
  name: string;
  description: string;
  /** `product.imageUrl` de la base — casi siempre `null` hoy (no hay imágenes de producto cargadas todavía). Se omite `image` del schema entero cuando no hay una real, no se rellena con un placeholder. */
  imageUrl?: string | null;
  priceCop: number;
  inStock: boolean;
  /** Página donde se vende — comparten URL varios `Product` (todas las denominaciones de un juego viven en `/catalogo/[game]`), y eso es válido en schema.org. */
  path: string;
}

/**
 * Arma un `JsonLdProduct` desde el `Product` real del catálogo (`lib/products.ts`,
 * el mismo shape que ya arma `toStoreProduct`) — un solo lugar que decide
 * `name`/`description`/`path`, así que `/catalogo` y `/catalogo/[game]`
 * (los dos lugares que muestran esta denominación) generan el mismo dato.
 */
export function toJsonLdProduct(product: Product): JsonLdProduct {
  return {
    id: product.id,
    name: `${product.denomination} ${product.unit} — ${product.gameLabel}`,
    description: `Recarga de ${product.denomination} ${product.unit} para ${product.gameLabel}, con entrega automática apenas se confirma el pago.`,
    imageUrl: product.imageUrl,
    priceCop: product.priceCop,
    inStock: product.stock !== "out",
    path: `/catalogo/${product.gameId}`,
  };
}

/**
 * `Product` + `Offer` (Fase 8) por denominación real. Deliberadamente NO
 * lleva:
 * - `brand`: BombaLoot no tiene licencia ni afiliación oficial con Riot
 *   Games/Roblox Corporation/Blizzard (mismo criterio que el comentario
 *   de `GAME_COLORS` en `products.ts`: "no official artwork or marks").
 *   Poner `brand: "Riot Games"` afirmaría una relación que no existe.
 * - `aggregateRating`/`review`: no hay sistema de reseñas en el sitio.
 * - `priceValidUntil`/descuentos: los precios no tienen fecha de
 *   vencimiento ni hay ningún descuento real que declarar acá.
 *
 * `priceCurrency: "COP"` — los precios en la base están en pesos
 * colombianos (`price_cop`, confirmado contra el schema real), nunca USD.
 */
export function productsJsonLd(products: JsonLdProduct[]): string {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  return jsonLdScript(
    products.map((p) => {
      const product: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.name,
        description: p.description,
        sku: p.id,
        offers: {
          "@type": "Offer",
          price: p.priceCop,
          priceCurrency: "COP",
          availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          url: `${baseUrl}${p.path}`,
          seller: { "@type": "Organization", name: SITE_NAME },
        },
      };
      if (p.imageUrl) {
        product.image = p.imageUrl.startsWith("http") ? p.imageUrl : `${baseUrl}${p.imageUrl}`;
      }
      return product;
    }),
  );
}

export interface JsonLdFaqItem {
  question: string;
  answer: string;
}

/**
 * `FAQPage` (Fase 8) — a partir de la MISMA lista de preguntas/respuestas
 * que ya se muestra en pantalla (en `/faq` y en `GameInfoSection`), nunca
 * texto nuevo escrito solo para el schema. `answer` va en texto plano
 * (sin los `<Link>` que sí lleva la versión visible) — Google acepta HTML
 * básico acá, pero mantenerlo en texto simple evita tener que sincronizar
 * dos formatos del mismo link.
 *
 * Nota real, no una promesa: desde 2023 Google solo muestra el rich
 * result de FAQPage para sitios gubernamentales/de salud reconocidos — en
 * la práctica esto ya no da el resultado enriquecido en búsqueda para un
 * e-commerce como este. Se implementa igual porque es información 100%
 * real y sigue siendo válida para otros consumidores de datos
 * estructurados (asistentes, IA de búsqueda) — no como promesa de rich
 * snippet en Google.
 */
export function faqPageJsonLd(items: JsonLdFaqItem[]): string {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  });
}

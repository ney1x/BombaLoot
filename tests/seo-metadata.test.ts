import { afterEach, describe, expect, it } from "vitest";
import type { Product } from "@/lib/products";
import { GAME_SEO, GAMES, productImageLabel } from "@/lib/products";
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  organizationJsonLd,
  pageMetadata,
  productsJsonLd,
  SITE_NAME,
  toJsonLdProduct,
  websiteJsonLd,
} from "@/lib/seo";
import { generateMetadata as generateGameMetadata } from "@/app/(storefront)/catalogo/[game]/page";

/**
 * Fase 2 — metadata única por página. No necesita Postgres: `GAME_SEO` es
 * estático y `generateMetadata` de `catalogo/[game]` no toca la base (solo
 * arma texto a partir del id del juego).
 */

describe("pageMetadata", () => {
  it("arma title/description/canonical/OG/Twitter consistentes entre sí", () => {
    const result = pageMetadata({ title: "T", description: "D", path: "/x" });

    expect(result.title).toBe("T");
    expect(result.description).toBe("D");
    expect(result.alternates).toEqual({ canonical: "/x" });
    expect(result.openGraph).toMatchObject({
      title: "T",
      description: "D",
      url: "/x",
      siteName: SITE_NAME,
      locale: "es_CO",
      type: "website",
    });
    expect(result.openGraph!.images).toHaveLength(1);
    expect(result.twitter).toMatchObject({ card: "summary_large_image", title: "T", description: "D" });
    expect(result.twitter!.images).toHaveLength(1);
  });
});

describe("GAME_SEO — copy por juego", () => {
  it("cada juego tiene title/description propios, ninguno genérico ni repetido", () => {
    const titles = GAMES.map((g) => GAME_SEO[g.id].title);
    expect(new Set(titles).size).toBe(GAMES.length);

    for (const g of GAMES) {
      expect(GAME_SEO[g.id].title).not.toBe("BombaLoot — recarga tu juego");
      expect(GAME_SEO[g.id].title.length).toBeGreaterThan(10);
      expect(GAME_SEO[g.id].description.length).toBeGreaterThan(20);
    }
  });

  it("usa la terminología real por juego (verificada contra UNIT_HINTS de ProductCreateForm)", () => {
    expect(GAME_SEO.valorant.title).toMatch(/VP/);
    expect(GAME_SEO.roblox.title).toMatch(/Robux/);
    expect(GAME_SEO.league.title).toMatch(/RP/);
    expect(GAME_SEO.overwatch.title).toMatch(/[Ss]aldo/);
  });
});

describe("catalogo/[game] generateMetadata", () => {
  it("cada juego genera su propia metadata — nunca hereda la genérica del layout", async () => {
    for (const g of GAMES) {
      const meta = await generateGameMetadata({ params: Promise.resolve({ game: g.id }) });
      expect(meta.title).toBe(GAME_SEO[g.id].title);
      expect(meta.title).not.toBe("BombaLoot — recarga tu juego");
      expect(meta.description).toBe(GAME_SEO[g.id].description);
      expect(meta.alternates).toEqual({ canonical: `/catalogo/${g.id}` });
    }
  });

  it("los 4 títulos generados son distintos entre sí", async () => {
    const titles = await Promise.all(
      GAMES.map(async (g) => (await generateGameMetadata({ params: Promise.resolve({ game: g.id }) })).title),
    );
    expect(new Set(titles).size).toBe(GAMES.length);
  });

  it("un game id inválido no tira — devuelve metadata vacía (el default export hace notFound)", async () => {
    const meta = await generateGameMetadata({ params: Promise.resolve({ game: "no-existe" }) });
    expect(meta).toEqual({});
  });
});

describe("breadcrumbJsonLd — Fase 5, jerarquía Home → Catálogo → Juego", () => {
  afterEach(() => {
    delete process.env.APP_URL;
  });

  it("arma un BreadcrumbList válido con posiciones 1-based y URLs absolutas", () => {
    process.env.APP_URL = "https://bombaloot.co";
    const json = JSON.parse(
      breadcrumbJsonLd([
        { name: "Home", path: "" },
        { name: "Catálogo", path: "/catalogo" },
        { name: "Valorant", path: "/catalogo/valorant" },
      ]),
    );

    expect(json["@context"]).toBe("https://schema.org");
    expect(json["@type"]).toBe("BreadcrumbList");
    expect(json.itemListElement).toHaveLength(3);
    expect(json.itemListElement.map((i: { position: number }) => i.position)).toEqual([1, 2, 3]);
    expect(json.itemListElement[0].item).toBe("https://bombaloot.co");
    expect(json.itemListElement[1].item).toBe("https://bombaloot.co/catalogo");
    expect(json.itemListElement[2].item).toBe("https://bombaloot.co/catalogo/valorant");
    expect(json.itemListElement[2].name).toBe("Valorant");
  });

  it("sin APP_URL cae a localhost:3000, nunca a un dominio hardcodeado", () => {
    delete process.env.APP_URL;
    const json = JSON.parse(breadcrumbJsonLd([{ name: "Home", path: "" }]));
    expect(json.itemListElement[0].item).toBe("http://localhost:3000");
  });
});

describe("organizationJsonLd / websiteJsonLd — Fase 8", () => {
  afterEach(() => {
    delete process.env.APP_URL;
  });

  it("Organization no inventa logo, sameAs ni teléfono/email — solo lo que existe de verdad", () => {
    const json = JSON.parse(organizationJsonLd());
    expect(json["@type"]).toBe("Organization");
    expect(json.name).toBe(SITE_NAME);
    expect(json.logo).toBeUndefined();
    expect(json.sameAs).toBeUndefined();
    expect(json.contactPoint.telephone).toBeUndefined();
    expect(json.contactPoint.email).toBeUndefined();
    expect(json.contactPoint.url).toBe("http://localhost:3000/ayuda");
  });

  it("WebSite no declara potentialAction — la búsqueda del navbar no arma ninguna URL real", () => {
    const json = JSON.parse(websiteJsonLd());
    expect(json["@type"]).toBe("WebSite");
    expect(json.potentialAction).toBeUndefined();
  });
});

function fakeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "valorant-565",
    gameId: "valorant",
    gameLabel: "Valorant",
    gameShortLabel: "Valorant",
    denomination: "565",
    unit: "VP",
    priceCop: 15000,
    stock: "available",
    imageUrl: null,
    ...overrides,
  };
}

describe("toJsonLdProduct / productsJsonLd — Fase 8", () => {
  it("usa moneda COP, disponibilidad real, y la URL canónica del juego (no una URL de producto inventada)", () => {
    const json = JSON.parse(productsJsonLd([toJsonLdProduct(fakeProduct())]));
    const [product] = json;

    expect(product["@type"]).toBe("Product");
    expect(product.sku).toBe("valorant-565");
    expect(product.offers.priceCurrency).toBe("COP");
    expect(product.offers.price).toBe(15000);
    expect(product.offers.availability).toBe("https://schema.org/InStock");
    expect(product.offers.url).toBe("http://localhost:3000/catalogo/valorant");
  });

  it("agotado → OutOfStock, nunca InStock", () => {
    const json = JSON.parse(productsJsonLd([toJsonLdProduct(fakeProduct({ stock: "out" }))]));
    expect(json[0].offers.availability).toBe("https://schema.org/OutOfStock");
  });

  it("sin imagen real (imageUrl null) no incluye el campo image — no rellena con un placeholder", () => {
    const json = JSON.parse(productsJsonLd([toJsonLdProduct(fakeProduct({ imageUrl: null }))]));
    expect(json[0].image).toBeUndefined();
  });

  it("con imagen real sí la incluye, absoluta", () => {
    const json = JSON.parse(
      productsJsonLd([toJsonLdProduct(fakeProduct({ imageUrl: "https://cdn.example.com/foo.png" }))]),
    );
    expect(json[0].image).toBe("https://cdn.example.com/foo.png");
  });

  it("nunca declara brand (sin licencia/afiliación oficial con el publisher), ni rating ni review", () => {
    const json = JSON.parse(productsJsonLd([toJsonLdProduct(fakeProduct())]));
    expect(json[0].brand).toBeUndefined();
    expect(json[0].aggregateRating).toBeUndefined();
    expect(json[0].review).toBeUndefined();
  });

  it("regresión (auditoría de seguridad, XSS almacenado): un </script> en denomination/unit no rompe el script real", () => {
    const malicious = fakeProduct({
      denomination: '1000</script><script>window.__pwned = true;</script>',
      unit: "VP",
    });
    const serialized = productsJsonLd([toJsonLdProduct(malicious)]);

    // El string serializado, tal como queda embebido en el <script>, nunca
    // contiene un </script> literal — si lo tuviera, cerraría el bloque
    // JSON-LD real y dejaría correr lo que sigue como HTML/JS nuevo.
    expect(serialized).not.toMatch(/<\/script>/i);
    expect(serialized).not.toContain("<script>window.__pwned");

    // Pero el dato en sí no se corrompe: cualquier parser de JSON (el de
    // Google incluido) recupera el string original tal cual.
    const json = JSON.parse(serialized);
    expect(json[0].name).toBe('1000</script><script>window.__pwned = true;</script> VP — Valorant');
  });
});

describe("faqPageJsonLd — Fase 8", () => {
  it("arma un Question/Answer por item, mismo orden y texto", () => {
    const json = JSON.parse(
      faqPageJsonLd([
        { question: "¿Uno?", answer: "Respuesta uno." },
        { question: "¿Dos?", answer: "Respuesta dos." },
      ]),
    );
    expect(json["@type"]).toBe("FAQPage");
    expect(json.mainEntity).toHaveLength(2);
    expect(json.mainEntity[0].name).toBe("¿Uno?");
    expect(json.mainEntity[0].acceptedAnswer.text).toBe("Respuesta uno.");
  });
});

describe("productImageLabel — Fase 9", () => {
  it("es exactamente el mismo texto que el `name` de Product en el schema (misma entidad, dos lugares)", () => {
    const product = fakeProduct();
    const jsonLdName = toJsonLdProduct(product).name;
    expect(productImageLabel(product)).toBe(jsonLdName);
  });

  it("distingue dos denominaciones del mismo juego — no cae al genérico 'Valorant'", () => {
    const a = productImageLabel(fakeProduct({ denomination: "565", unit: "VP" }));
    const b = productImageLabel(fakeProduct({ denomination: "1000", unit: "VP" }));
    expect(a).not.toBe(b);
    expect(a).not.toBe("Valorant");
  });
});

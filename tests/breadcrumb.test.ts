import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Breadcrumb } from "@/components/Breadcrumb";

/**
 * Fase 7 — un solo componente arma el breadcrumb visible y el JSON-LD a la
 * vez, a partir de la misma lista de items (antes vivían en dos lugares
 * distintos, con riesgo real de desincronizarse). `.test.ts`, no `.test.tsx`
 * — mismo motivo que `game-info-section.test.ts`.
 */

const ITEMS = [
  { name: "Home", path: "" },
  { name: "Catálogo", path: "/catalogo" },
  { name: "Valorant", path: "/catalogo/valorant" },
];

describe("Breadcrumb", () => {
  it("linkea todos los items salvo el último (la página actual no es un link a sí misma)", () => {
    const html = renderToStaticMarkup(createElement(Breadcrumb, { items: ITEMS }));

    expect(html).toContain('href="/"');
    expect(html).toContain('href="/catalogo"');
    // "Valorant" (último item) aparece como texto plano, no dentro de un <a href="/catalogo/valorant">
    expect(html).not.toContain('href="/catalogo/valorant"');
    expect(html).toContain("Valorant");
  });

  it("el JSON-LD tiene exactamente un ListItem por item, en el mismo orden", () => {
    const html = renderToStaticMarkup(createElement(Breadcrumb, { items: ITEMS }));
    const match = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/);
    expect(match).not.toBeNull();

    const json = JSON.parse(match![1]);
    expect(json["@type"]).toBe("BreadcrumbList");
    expect(json.itemListElement).toHaveLength(3);
    expect(json.itemListElement.map((i: { name: string }) => i.name)).toEqual([
      "Home",
      "Catálogo",
      "Valorant",
    ]);
  });

  it("con 2 items (Home + una página de contenido) no repite Home de más en el breadcrumb visible", () => {
    const html = renderToStaticMarkup(
      createElement(Breadcrumb, { items: [{ name: "Home", path: "" }, { name: "Ayuda", path: "/ayuda" }] }),
    );
    // "Home" aparece una vez en el JSON-LD (name) y otra en el texto visible —
    // separamos ambos para no confundir "aparece 2 veces en total" con "se repite".
    const [, visible] = html.split(/<\/script>/);
    expect((visible.match(/Home/g) ?? []).length).toBe(1);
  });
});

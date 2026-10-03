import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameInfoSection, RelatedGamesSection } from "@/components/GameInfoSection";
import { GAMES } from "@/lib/products";

/**
 * Fase 3 — estructura y contenido. `GameInfoSection` no usa hooks ni
 * contexto (a diferencia de `GamePurchase`, que sí — por eso no se testea
 * acá), así que alcanza con `renderToStaticMarkup` en Node plano, sin jsdom.
 * `.test.ts`, no `.test.tsx`, a propósito: `vitest.config.ts` solo incluye
 * `.test.ts` — `createElement` en vez de JSX evita necesitar la otra
 * extensión para este único archivo.
 */

describe("GameInfoSection", () => {
  it("cada juego renderiza un H2 y cinco H3, con los métodos de pago reales y los 3 links internos", () => {
    for (const game of GAMES) {
      const html = renderToStaticMarkup(createElement(GameInfoSection, { game }));

      expect((html.match(/<h2/g) ?? []).length).toBe(1);
      expect((html.match(/<h3/g) ?? []).length).toBe(5);
      expect(html).toContain(game.label);

      // Mismos 4 métodos que PAYMENT_METHODS en lib/checkout.ts — nunca inventados.
      for (const method of ["Nequi", "PSE", "PayPal"]) {
        expect(html).toContain(method);
      }

      expect(html).toContain('href="/ayuda"');
      expect(html).toContain('href="/terminos"');
      expect(html).toContain('href="/faq"');
    }
  });

  it("el H2 aparece antes que los H3 (jerarquía en orden, no solo en cantidad)", () => {
    const html = renderToStaticMarkup(createElement(GameInfoSection, { game: GAMES[0] }));
    const h2Index = html.indexOf("<h2");
    const firstH3Index = html.indexOf("<h3");
    expect(h2Index).toBeGreaterThanOrEqual(0);
    expect(firstH3Index).toBeGreaterThan(h2Index);
  });

  it("el contenido de 'qué puedo comprar' es distinto para cada juego (no texto genérico repetido)", () => {
    const rendered = GAMES.map((game) => renderToStaticMarkup(createElement(GameInfoSection, { game })));
    expect(new Set(rendered).size).toBe(GAMES.length);
  });
});

describe("RelatedGamesSection — Fase 6, enlazado cruzado entre juegos", () => {
  it("linkea a los otros 3 juegos, nunca al juego actual, con anchor text descriptivo (no 'ver más')", () => {
    for (const game of GAMES) {
      const html = renderToStaticMarkup(createElement(RelatedGamesSection, { game }));

      expect((html.match(/<h2/g) ?? []).length).toBe(1);

      const otherGames = GAMES.filter((g) => g.id !== game.id);
      expect(otherGames).toHaveLength(GAMES.length - 1);
      for (const other of otherGames) {
        expect(html).toContain(`href="/catalogo/${other.id}"`);
      }
      expect(html).not.toContain(`href="/catalogo/${game.id}"`);

      // Nada de "ver más"/"click aquí" — el texto visible del link ya dice qué se compra.
      expect(html.toLowerCase()).not.toMatch(/ver más|haz clic|click aquí|clic aquí/);
    }
  });
});

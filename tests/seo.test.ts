import { afterEach, describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

/**
 * Fase 1 — indexación y crawling. `robots.ts`/`sitemap.ts` no tocan la base
 * (GAMES es estático), así que estos tests corren sin Postgres — a
 * diferencia del resto de la suite.
 */

const PUBLIC_PATHS = [
  "/",
  "/catalogo",
  "/catalogo/valorant",
  "/catalogo/roblox",
  "/catalogo/league",
  "/catalogo/overwatch",
  "/faq",
  "/ayuda",
  "/terminos",
  "/privacidad",
  "/cookies",
];

const PRIVATE_PATHS = [
  "/admin",
  "/admin/productos",
  "/api",
  "/api/checkout",
  "/checkout",
  "/checkout/pago",
  "/checkout/resultado/pagado",
  "/carrito",
  "/cuenta",
  "/cuenta/login",
  "/cuenta/registro",
  "/cuenta/recuperar",
  "/cuenta/pedidos",
  "/cuenta/soporte",
  "/pedido/abc123",
  "/ayuda/ticket/T-ABCD-1234",
  "/invitacion-admin/sometoken",
];

/** Traduce un patrón de robots.txt (con `*` como comodín) a un match de PREFIJO, igual que lo interpreta Google. */
function escapeRegex(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}
function robotsRuleMatches(pattern: string, path: string): boolean {
  const source = "^" + pattern.split("*").map(escapeRegex).join(".*");
  return new RegExp(source).test(path);
}

function getDisallowList(): string[] {
  const { rules } = robots();
  const rule = Array.isArray(rules) ? rules[0] : rules;
  const disallow = rule!.disallow;
  return Array.isArray(disallow) ? disallow : disallow ? [disallow] : [];
}

describe("robots.ts", () => {
  afterEach(() => {
    delete process.env.APP_URL;
  });

  it("permite todo por default (Allow: /)", () => {
    const { rules } = robots();
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule!.allow).toBe("/");
    expect(rule!.userAgent).toBe("*");
  });

  it("bloquea cada ruta privada/transaccional del árbol real de páginas", () => {
    const disallow = getDisallowList();
    for (const path of PRIVATE_PATHS) {
      const blocked = disallow.some((rule) => robotsRuleMatches(rule, path));
      expect(blocked, `${path} debería estar bloqueada`).toBe(true);
    }
  });

  it("NUNCA bloquea una página pública — regresión si alguien agranda el disallow sin querer", () => {
    const disallow = getDisallowList();
    for (const path of PUBLIC_PATHS) {
      const blocked = disallow.some((rule) => robotsRuleMatches(rule, path));
      expect(blocked, `${path} no debería estar bloqueada`).toBe(false);
    }
  });

  it("bloquea las variantes con querystring de /catalogo (mismo contenido que la URL canónica)", () => {
    const disallow = getDisallowList();
    const dupes = ["/catalogo?game=valorant", "/catalogo/valorant?select=565"];
    for (const path of dupes) {
      const blocked = disallow.some((rule) => robotsRuleMatches(rule, path));
      expect(blocked, `${path} debería estar bloqueada (duplicado de contenido)`).toBe(true);
    }
  });

  it("apunta el sitemap a APP_URL/sitemap.xml", () => {
    process.env.APP_URL = "https://bombaloot.co";
    expect(robots().sitemap).toBe("https://bombaloot.co/sitemap.xml");
  });

  it("sin APP_URL cae a localhost:3000 (dev), nunca a un dominio hardcodeado", () => {
    delete process.env.APP_URL;
    expect(robots().sitemap).toBe("http://localhost:3000/sitemap.xml");
  });
});

describe("sitemap.ts", () => {
  afterEach(() => {
    delete process.env.APP_URL;
  });

  it("incluye exactamente las páginas públicas esperadas, sin duplicados", () => {
    const entries = sitemap();
    const paths = entries.map((e) => new URL(e.url).pathname);

    for (const path of PUBLIC_PATHS) {
      expect(paths, `falta ${path} en el sitemap`).toContain(path);
    }
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("no incluye ninguna URL privada/transaccional", () => {
    const entries = sitemap();
    const paths = entries.map((e) => new URL(e.url).pathname);
    const privatePrefixes = ["/admin", "/api", "/checkout", "/carrito", "/cuenta", "/pedido", "/ayuda/ticket", "/invitacion-admin"];
    for (const path of paths) {
      for (const prefix of privatePrefixes) {
        expect(path.startsWith(prefix), `${path} no debería estar en el sitemap`).toBe(false);
      }
    }
  });

  it("ninguna URL lleva querystring", () => {
    const entries = sitemap();
    for (const entry of entries) {
      expect(entry.url.includes("?"), `${entry.url} no debería tener querystring`).toBe(false);
    }
  });

  it("todas las URLs son absolutas y responden a APP_URL", () => {
    process.env.APP_URL = "https://bombaloot.co";
    const entries = sitemap();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.url.startsWith("https://bombaloot.co")).toBe(true);
      expect(() => new URL(entry.url)).not.toThrow();
    }
  });

  it("cada entrada tiene prioridad entre 0 y 1", () => {
    for (const entry of sitemap()) {
      expect(entry.priority).toBeGreaterThanOrEqual(0);
      expect(entry.priority).toBeLessThanOrEqual(1);
    }
  });
});

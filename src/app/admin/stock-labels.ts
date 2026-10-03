/**
 * Antes duplicado literal entre `productos/page.tsx` e `inventario/page.tsx`
 * — la duplicación es justo lo que hizo que las dos tablas divergieran
 * (una tenía orden por severidad + columna de umbral, la otra no). Un solo
 * lugar de ahora en más.
 */
export const STOCK_LABEL: Record<string, string> = { available: "OK", low: "STOCK BAJO", out: "AGOTADO" };
export const STOCK_TONE: Record<string, string> = { available: "good", low: "warn", out: "bad" };

const SEVERITY_ORDER: Record<string, number> = { out: 0, low: 1, available: 2 };

/** out → low → available, mismo criterio que ya usaba `inventario/page.tsx`. */
export function sortBySeverity<T extends { stock: "available" | "low" | "out" }>(products: T[]): T[] {
  return [...products].sort((a, b) => SEVERITY_ORDER[a.stock] - SEVERITY_ORDER[b.stock]);
}

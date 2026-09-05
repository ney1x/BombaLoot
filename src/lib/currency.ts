/**
 * Formato del precio de referencia en moneda local — puro, sin fetch ni
 * `next/headers`, así que lo puede importar tanto un Server Component como
 * uno `"use client"` (`GamePurchase`, `ProductTile`, `CatalogGrid`). La
 * parte que sí toca red/headers vive en `@/server/services/geo-price`
 * (server-only) y le pasa el resultado a estos componentes como prop
 * serializable.
 *
 * SOLO informativo: el cobro real siempre es en COP (Wompi/Nequi/PSE) o lo
 * que resuelva PayPal en su propio checkout — acá no se decide ni se
 * guarda ningún monto.
 */
export interface PriceEstimateContext {
  currency: string;
  locale: string;
  rate: number;
}

export function formatEstimate(priceCop: number, ctx: PriceEstimateContext | null): string | null {
  if (!ctx) return null;
  const amount = priceCop * ctx.rate;
  const formatted = new Intl.NumberFormat(ctx.locale, {
    style: "currency",
    currency: ctx.currency,
    maximumFractionDigits: 0,
  }).format(amount);
  // El código ISO va siempre, aunque `formatted` ya incluya un símbolo: varias
  // monedas de la región (MXN, ARS, CLP...) usan el mismo glifo "$" que COP.
  // Sin el código, "≈ $86" al lado de "$16.000" se lee como la misma moneda
  // en vez de una conversión — justo la confusión que esto existe para evitar.
  return `≈ ${formatted} ${ctx.currency}`;
}

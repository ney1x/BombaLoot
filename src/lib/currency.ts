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

export interface SupportedCountry {
  code: string;
  /** Nombre en español, el que ve la persona en el selector del navbar. */
  label: string;
  currency: string;
  locale: string;
}

/**
 * Única fuente de verdad para qué países tienen conversión — la usan tanto
 * el selector manual del navbar (`CountryPicker`, cliente) como la
 * detección automática por IP (`@/server/services/geo-price`, servidor).
 * No es "países que aceptan Wompi" en el sentido de método de pago — Wompi
 * (tarjetas) y PayPal ya cubren cualquier país del mundo; esta lista es
 * simplemente qué monedas sabemos convertir y formatear.
 */
export const SUPPORTED_COUNTRIES: SupportedCountry[] = [
  { code: "MX", label: "México", currency: "MXN", locale: "es-MX" },
  { code: "US", label: "Estados Unidos", currency: "USD", locale: "en-US" },
  { code: "CA", label: "Canadá", currency: "CAD", locale: "en-CA" },
  { code: "AR", label: "Argentina", currency: "ARS", locale: "es-AR" },
  { code: "CL", label: "Chile", currency: "CLP", locale: "es-CL" },
  { code: "PE", label: "Perú", currency: "PEN", locale: "es-PE" },
  { code: "EC", label: "Ecuador", currency: "USD", locale: "es-EC" },
  { code: "PA", label: "Panamá", currency: "USD", locale: "es-PA" },
  { code: "BR", label: "Brasil", currency: "BRL", locale: "pt-BR" },
  { code: "UY", label: "Uruguay", currency: "UYU", locale: "es-UY" },
  { code: "BO", label: "Bolivia", currency: "BOB", locale: "es-BO" },
  { code: "PY", label: "Paraguay", currency: "PYG", locale: "es-PY" },
  { code: "CR", label: "Costa Rica", currency: "CRC", locale: "es-CR" },
  { code: "GT", label: "Guatemala", currency: "GTQ", locale: "es-GT" },
  { code: "HN", label: "Honduras", currency: "HNL", locale: "es-HN" },
  { code: "SV", label: "El Salvador", currency: "USD", locale: "es-SV" },
  { code: "DO", label: "República Dominicana", currency: "DOP", locale: "es-DO" },
  { code: "ES", label: "España", currency: "EUR", locale: "es-ES" },
];

/** Nombre de la cookie donde se guarda la elección manual — la lee tanto el cliente (mostrar la selección actual) como el servidor (`geo-price.ts`, calcular el precio). */
export const COUNTRY_COOKIE_NAME = "loadout_country";

/** 🇨🇴, 🇲🇽, etc. — se arma con los "regional indicator symbols" de Unicode, no hay que mantener un mapa de emojis a mano. */
export function countryFlagEmoji(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((char) => 127397 + char.charCodeAt(0)));
}

/**
 * URL de la bandera como imagen (Twemoji), no como emoji de fuente del
 * sistema. Windows no dibuja los "regional indicator symbols" como bandera
 * — Microsoft los reemplaza a propósito por el código de dos letras en
 * texto plano en sus fuentes (Segoe UI Emoji), así que `countryFlagEmoji`
 * se ve como "AR" en vez de 🇦🇷 en cualquier navegador sobre Windows. Una
 * imagen no depende de la fuente del sistema operativo: se ve igual en
 * Windows, Mac, Linux, Android e iOS.
 *
 * El nombre del asset de Twemoji para una bandera es el par de puntos de
 * código Unicode de sus dos "regional indicator symbols", en hex y
 * separados por guion (ej. Argentina = U+1F1E6 U+1F1F7 → "1f1e6-1f1f7").
 */
export function countryFlagUrl(code: string): string {
  const codePoints = [...code.toUpperCase()].map((char) => (127397 + char.charCodeAt(0)).toString(16));
  // El paquete publicado en npm no incluye /assets en jsDelivr (404) — el mismo
  // tag del repo de GitHub sí lo sirve, y jsDelivr lo cachea igual de bien.
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codePoints.join("-")}.svg`;
}

/**
 * El monto convertido, formateado — SIN el símbolo "≈": cuando hay un país
 * elegido (auto por IP o manual desde el navbar), este es el precio que se
 * muestra GRANDE, como precio principal — no una nota chica al costado. El
 * de COP pasa a ser la línea secundaria (`formatCop`, sin cambios), no al
 * revés: sigue siendo lo único que de verdad se cobra (Wompi/PayPal
 * resuelven en COP o USD, nunca en la moneda que se elija acá), así que
 * conviene que quede visible igual, solo que ya no como protagonista.
 *
 * El código ISO va siempre, aunque `formatted` ya incluya un símbolo:
 * varias monedas de la región (MXN, ARS, CLP...) usan el mismo glifo "$"
 * que COP — sin el código, "$86" al lado de "$16.000" se lee como la misma
 * moneda en vez de una conversión.
 */
export function formatConverted(priceCop: number, ctx: PriceEstimateContext): string {
  const amount = priceCop * ctx.rate;
  const formatted = new Intl.NumberFormat(ctx.locale, {
    style: "currency",
    currency: ctx.currency,
    maximumFractionDigits: 0,
  }).format(amount);
  return `${formatted} ${ctx.currency}`;
}

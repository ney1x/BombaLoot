import "server-only";
import { headers } from "next/headers";
import type { PriceEstimateContext } from "@/lib/currency";

/**
 * País por `x-vercel-ip-country` — header que Vercel agrega solo en
 * producción (edge), gratis, sin código propio de geolocalización. Fuera
 * de Vercel (dev local, otro host) el header no existe y esto se apaga
 * solo: se sigue viendo nada más que el precio en COP, igual que hoy.
 */
const COUNTRY_CURRENCY: Record<string, { currency: string; locale: string }> = {
  MX: { currency: "MXN", locale: "es-MX" },
  US: { currency: "USD", locale: "en-US" },
  CA: { currency: "CAD", locale: "en-CA" },
  AR: { currency: "ARS", locale: "es-AR" },
  CL: { currency: "CLP", locale: "es-CL" },
  PE: { currency: "PEN", locale: "es-PE" },
  EC: { currency: "USD", locale: "es-EC" },
  PA: { currency: "USD", locale: "es-PA" },
  BR: { currency: "BRL", locale: "pt-BR" },
  UY: { currency: "UYU", locale: "es-UY" },
  BO: { currency: "BOB", locale: "es-BO" },
  PY: { currency: "PYG", locale: "es-PY" },
  CR: { currency: "CRC", locale: "es-CR" },
  GT: { currency: "GTQ", locale: "es-GT" },
  HN: { currency: "HNL", locale: "es-HN" },
  SV: { currency: "USD", locale: "es-SV" },
  DO: { currency: "DOP", locale: "es-DO" },
  ES: { currency: "EUR", locale: "es-ES" },
};

const RATES_URL = "https://open.er-api.com/v6/latest/COP";

/** Tasas COP→resto, cacheadas 12h por `fetch` de Next — un pedido de red cada tanto, no uno por visita. */
async function fetchCopRates(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(RATES_URL, { next: { revalidate: 43_200 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== "success" || !data.rates) return null;
    return data.rates;
  } catch {
    return null;
  }
}

export async function detectCountry(): Promise<string | null> {
  const store = await headers();
  return store.get("x-vercel-ip-country");
}

/**
 * `null` en cualquier paso (sin header de país, país no mapeado, o falla la
 * API de tasas) apaga la conversión entera — nunca un precio a medias ni
 * una página que no carga por esto.
 */
export async function getPriceEstimateContext(): Promise<PriceEstimateContext | null> {
  const country = await detectCountry();
  if (!country || country === "CO") return null;
  const mapped = COUNTRY_CURRENCY[country];
  if (!mapped) return null;
  const rates = await fetchCopRates();
  const rate = rates?.[mapped.currency];
  if (!rate) return null;
  return { currency: mapped.currency, locale: mapped.locale, rate };
}

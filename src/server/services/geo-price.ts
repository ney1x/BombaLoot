import "server-only";
import { cookies, headers } from "next/headers";
import { COUNTRY_COOKIE_NAME, SUPPORTED_COUNTRIES, type PriceEstimateContext } from "@/lib/currency";

/**
 * País del visitante — dos fuentes, en orden de prioridad:
 * 1. Cookie `loadout_country` — elección MANUAL desde el selector del
 *    navbar (`CountryPicker`). Gana siempre que exista, exactamente para
 *    el caso que la motivó: alguien detectado mal por IP (VPN, iCloud
 *    Private Relay, geolocalización de por sí imperfecta) puede corregirlo
 *    a mano.
 * 2. `x-vercel-ip-country` — header que Vercel agrega solo en producción
 *    (edge), gratis, sin código propio de geolocalización. Fuera de Vercel
 *    (dev local, otro host) no existe y esto se apaga solo.
 */
const COUNTRY_CURRENCY: Record<string, { currency: string; locale: string }> = Object.fromEntries(
  SUPPORTED_COUNTRIES.map((c) => [c.code, { currency: c.currency, locale: c.locale }]),
);

const RATES_URL = "https://open.er-api.com/v6/latest/COP";

/** Tasas COP→resto, cacheadas 12h por `fetch` de Next — un pedido de red cada tanto, no uno por visita. */
async function fetchCopRates(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(RATES_URL, { next: { revalidate: 43_200 } });
    if (!res.ok) {
      console.error("[geo-price] open.er-api.com respondió", res.status);
      return null;
    }
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== "success" || !data.rates) {
      console.error("[geo-price] respuesta sin 'success'/'rates'", data.result);
      return null;
    }
    return data.rates;
  } catch (error) {
    console.error("[geo-price] fetch de tasas falló", error);
    return null;
  }
}

export async function detectCountry(): Promise<string | null> {
  const cookieStore = await cookies();
  const override = cookieStore.get(COUNTRY_COOKIE_NAME)?.value;
  if (override && (override === "CO" || COUNTRY_CURRENCY[override])) return override;

  const store = await headers();
  return store.get("x-vercel-ip-country");
}

/**
 * `null` en cualquier paso (sin header de país, país no mapeado, o falla la
 * API de tasas) apaga la conversión entera — nunca un precio a medias ni
 * una página que no carga por esto. Verificado en producción con tráfico
 * real (2026-09-05): visitantes detectados en US reciben la conversión
 * correcta; un visitante sin la conversión casi siempre es un país no
 * mapeado, o un enmascarador de IP (VPN, iCloud Private Relay) que expone
 * una ubicación distinta a la real — no algo corregible del lado del código
 * (para eso existe ahora la corrección manual vía cookie, arriba).
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

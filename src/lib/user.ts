/**
 * Mock account data — no real auth/backend yet. Shapes mirror what the
 * eventual API will return, so components read tier/user data as props
 * instead of hardcoded numbers, per the loyalty-config decision in
 * ANALISIS-PROYECTO.md.
 */

export interface LoyaltyTier {
  id: string;
  name: string;
  minPurchases: number;
  discountPct: number;
  benefits: string[];
}

/**
 * Example tier config — the admin panel owns the real values (min
 * purchases, %, repeat interval) in `loyalty_tiers`; esto solo alimenta el
 * texto de progreso/beneficios en la cuenta. La fidelización ya no
 * descuenta sola en cada compra: al cruzar el umbral gana un cupón de un
 * solo uso, propio de su cuenta, que el cliente elige cuándo canjear (ver
 * `ensureLoyaltyCoupons` en server/services/loyalty.ts).
 */
export const LOYALTY_TIERS: LoyaltyTier[] = [
  { id: "bronze", name: "Bronze", minPurchases: 0, discountPct: 0, benefits: ["Historial de compras", "Soporte estándar"] },
  { id: "silver", name: "Silver", minPurchases: 5, discountPct: 3, benefits: ["Cupón de 3% de un solo uso al llegar", "Soporte prioritario"] },
  { id: "gold", name: "Gold", minPurchases: 10, discountPct: 5, benefits: ["Cupón de 5% de un solo uso al llegar", "Acceso anticipado a promociones"] },
  { id: "vip", name: "VIP", minPurchases: 20, discountPct: 8, benefits: ["Cupón de 8% de un solo uso al llegar", "Cupón nuevo cada ciertas compras", "Soporte dedicado", "Regalos por temporada"] },
];

export function tierForPurchases(purchases: number): LoyaltyTier {
  return [...LOYALTY_TIERS].reverse().find((t) => purchases >= t.minPurchases) ?? LOYALTY_TIERS[0];
}

export function nextTier(current: LoyaltyTier): LoyaltyTier | null {
  const idx = LOYALTY_TIERS.findIndex((t) => t.id === current.id);
  return LOYALTY_TIERS[idx + 1] ?? null;
}

export interface MockUser {
  name: string;
  email: string;
  purchasesCount: number;
}

export const MOCK_USER: MockUser = {
  name: "Ana Martínez",
  email: "ana.martinez@email.com",
  purchasesCount: 7,
};

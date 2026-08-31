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

/** Example tier config — the admin panel will own these values later. */
export const LOYALTY_TIERS: LoyaltyTier[] = [
  { id: "bronze", name: "Bronze", minPurchases: 0, discountPct: 0, benefits: ["Historial de compras", "Soporte estándar"] },
  { id: "silver", name: "Silver", minPurchases: 5, discountPct: 3, benefits: ["3% de descuento en cada compra", "Soporte prioritario"] },
  { id: "gold", name: "Gold", minPurchases: 10, discountPct: 5, benefits: ["5% de descuento en cada compra", "Acceso anticipado a promociones"] },
  { id: "vip", name: "VIP", minPurchases: 20, discountPct: 8, benefits: ["8% de descuento en cada compra", "Soporte dedicado", "Regalos por temporada"] },
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

import type { Metadata } from "next";
import shared from "../shared.module.css";
import { getCurrentSession } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { countCustomersByTier, listLoyaltyTiers } from "@/server/services/admin-loyalty";
import { LoyaltyTiersManager } from "@/components/admin/LoyaltyTiersManager";

export const metadata: Metadata = { title: "Fidelización — Admin BombaLoot" };

export default async function AdminLoyaltyPage() {
  const [session, tiers, customerCounts] = await Promise.all([
    getCurrentSession(),
    listLoyaltyTiers(getDb()),
    countCustomersByTier(getDb()),
  ]);
  const canEdit = session?.role === "ADMIN" || session?.role === "SUPERADMIN";

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Fidelización</h1>
          <p className={shared.subtitle}>
            Niveles por cantidad de compras — al cruzar un umbral, el cliente gana un cupón de un solo uso en su
            cuenta (nunca un descuento automático). El checkout usa esta misma tabla para saber cuándo otorgarlo.
          </p>
        </div>
      </div>
      <LoyaltyTiersManager initialTiers={tiers} canEdit={canEdit} customerCounts={customerCounts} />
    </div>
  );
}

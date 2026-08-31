import type { Metadata } from "next";
import shared from "../shared.module.css";
import { getCurrentSession } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { listLoyaltyTiers } from "@/server/services/admin-loyalty";
import { LoyaltyTiersManager } from "@/components/admin/LoyaltyTiersManager";

export const metadata: Metadata = { title: "Fidelización — Admin Loadout" };

export default async function AdminLoyaltyPage() {
  const [session, tiers] = await Promise.all([getCurrentSession(), listLoyaltyTiers(getDb())]);
  const canEdit = session?.role === "ADMIN";

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Fidelización</h1>
          <p className={shared.subtitle}>
            Niveles por cantidad de compras — el checkout usa esta misma tabla para calcular el descuento.
          </p>
        </div>
      </div>
      <LoyaltyTiersManager initialTiers={tiers} canEdit={canEdit} />
    </div>
  );
}

import type { Metadata } from "next";
import shared from "../shared.module.css";
import { getCurrentSession } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { listDiscountRules } from "@/server/services/admin-discounts";
import { DiscountsManager } from "@/components/admin/DiscountsManager";

export const metadata: Metadata = { title: "Descuentos — Admin bombaloot" };

export default async function AdminDiscountsPage() {
  const [session, discounts] = await Promise.all([getCurrentSession(), listDiscountRules(getDb())]);
  const canEdit = session?.role === "ADMIN";

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Descuentos</h1>
          <p className={shared.subtitle}>Reglas activas — el checkout las aplica en tiempo real, nunca desde acá directamente.</p>
        </div>
      </div>
      <DiscountsManager initialDiscounts={discounts} canEdit={canEdit} />
    </div>
  );
}

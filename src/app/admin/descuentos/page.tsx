import type { Metadata } from "next";
import shared from "../shared.module.css";
import { getCurrentSession } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { listDiscountRules } from "@/server/services/admin-discounts";
import { DiscountsManager } from "@/components/admin/DiscountsManager";

export const metadata: Metadata = { title: "Descuentos — Admin BombaLoot" };

export default async function AdminDiscountsPage() {
  const [session, discounts] = await Promise.all([getCurrentSession(), listDiscountRules(getDb())]);
  const canEdit = session?.role === "ADMIN" || session?.role === "SUPERADMIN";

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Descuentos</h1>
          <p className={shared.subtitle}>Reglas activas — el checkout las aplica en tiempo real, nunca desde acá directamente.</p>
        </div>
      </div>
      <DiscountsManager
        initialDiscounts={discounts.map((d) => ({
          id: d.id,
          code: d.code,
          kind: d.kind,
          value: d.value,
          scope: d.scope,
          scopeRef: d.scopeRef,
          minSubtotalCop: d.minSubtotalCop,
          startsAt: d.startsAt ? d.startsAt.toISOString() : null,
          endsAt: d.endsAt ? d.endsAt.toISOString() : null,
          maxUses: d.maxUses,
          usesCount: d.usesCount,
          maxUsesPerUser: d.maxUsesPerUser,
          stackable: d.stackable,
          isActive: d.isActive,
        }))}
        canEdit={canEdit}
      />
    </div>
  );
}

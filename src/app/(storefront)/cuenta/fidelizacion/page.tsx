import type { Metadata } from "next";
import accountStyles from "../account.module.css";
import styles from "./fidelizacion.module.css";
import { AccountShell } from "@/components/AccountShell";
import { LoyaltyProgress } from "@/components/LoyaltyProgress";
import { requireUser } from "@/server/auth/guards";
import { LOYALTY_TIERS, tierForPurchases } from "@/lib/user";

export const metadata: Metadata = { title: "Fidelización — BombaLoot" };

export default async function FidelizacionPage() {
  const user = await requireUser("/cuenta/fidelizacion");
  const tier = tierForPurchases(user.purchasesCount);

  return (
    <AccountShell user={user}>
      <div className={accountStyles.pageHead}>
        <h1>Fidelización</h1>
        <p>Cuanto más comprás, más descuento tenés en cada pedido.</p>
      </div>

      <div className={accountStyles.section}>
        <LoyaltyProgress tier={tier} purchasesCount={user.purchasesCount} />
      </div>

      <div className={accountStyles.section}>
        <div className={accountStyles.sectionHead}>
          <h2>Todos los niveles</h2>
        </div>
        <div className={styles.ladder}>
          {LOYALTY_TIERS.map((t) => (
            <div key={t.id} className={`${styles.tierCard} ${t.id === tier.id ? styles.active : ""}`}>
              <h3>{t.name}</h3>
              <div className={styles.req}>{t.minPurchases}+ compras</div>
              <div className={styles.pct}>{t.discountPct > 0 ? `${t.discountPct}% off` : "Sin descuento"}</div>
            </div>
          ))}
        </div>
      </div>
    </AccountShell>
  );
}

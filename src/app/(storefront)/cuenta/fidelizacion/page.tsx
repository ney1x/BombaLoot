import type { Metadata } from "next";
import accountStyles from "../account.module.css";
import styles from "./fidelizacion.module.css";
import { AccountShell } from "@/components/AccountShell";
import { LoyaltyProgress } from "@/components/LoyaltyProgress";
import { requireUser } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { getAccountLoyaltyCoupons } from "@/server/services/loyalty";
import { LOYALTY_TIERS, tierForPurchases } from "@/lib/user";

export const metadata: Metadata = { title: "Fidelización — BombaLoot" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function FidelizacionPage() {
  const user = await requireUser("/cuenta/fidelizacion");
  const tier = tierForPurchases(user.purchasesCount);
  const coupons = await getAccountLoyaltyCoupons(getPool(), user.userId, user.purchasesCount);

  return (
    <AccountShell user={user}>
      <div className={accountStyles.pageHead}>
        <h1>Fidelización</h1>
        <p>
          Ya no es un % que se aplica solo — cada nivel te da un cupón de un solo uso en tu cuenta. Vos elegís en
          qué pedido lo usás.
        </p>
      </div>

      <div className={accountStyles.section}>
        <LoyaltyProgress tier={tier} purchasesCount={user.purchasesCount} availableCoupons={coupons.available.length} />
      </div>

      <div className={accountStyles.section}>
        <div className={accountStyles.sectionHead}>
          <h2>Tus cupones disponibles</h2>
        </div>
        {coupons.available.length === 0 ? (
          <p className={styles.couponEmpty}>
            Todavía no tenés cupones sin usar. Se otorgan solos al cruzar un nivel nuevo — no hay que reclamarlos.
          </p>
        ) : (
          <div className={styles.couponList}>
            {coupons.available.map((c) => (
              <div key={c.id} className={styles.couponCard}>
                <div>
                  <div className={styles.couponName}>
                    {c.tierName} · {c.discountPct}%
                  </div>
                  <div className={styles.couponMeta}>
                    {c.reason === "REPEAT_INTERVAL" ? "Cupón de repetición" : "Al llegar al nivel"} · ganado el{" "}
                    {formatDate(c.grantedAt)}
                  </div>
                </div>
                <span className={styles.couponStatus}>Disponible — se usa en el checkout</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {coupons.redeemed.length > 0 && (
        <div className={accountStyles.section}>
          <div className={accountStyles.sectionHead}>
            <h2>Cupones ya usados</h2>
          </div>
          <div className={styles.couponList}>
            {coupons.redeemed.map((c) => (
              <div key={c.id} className={`${styles.couponCard} ${styles.redeemed}`}>
                <div>
                  <div className={styles.couponName}>
                    {c.tierName} · {c.discountPct}%
                  </div>
                  <div className={styles.couponMeta}>ganado el {formatDate(c.grantedAt)}</div>
                </div>
                <span className={styles.couponStatus}>Usado el {formatDate(c.redeemedAt!)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={accountStyles.section}>
        <div className={accountStyles.sectionHead}>
          <h2>Todos los niveles</h2>
        </div>
        <div className={styles.ladder}>
          {LOYALTY_TIERS.map((t) => (
            <div key={t.id} className={`${styles.tierCard} ${t.id === tier.id ? styles.active : ""}`}>
              <h3>{t.name}</h3>
              <div className={styles.req}>{t.minPurchases}+ compras</div>
              <div className={styles.pct}>{t.discountPct > 0 ? `Cupón de ${t.discountPct}%` : "Sin cupón"}</div>
            </div>
          ))}
        </div>
      </div>
    </AccountShell>
  );
}

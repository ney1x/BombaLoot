import type { CSSProperties } from "react";
import styles from "./LoyaltyProgress.module.css";
import { AwardIcon } from "./icons";
import { nextTier, type LoyaltyTier } from "@/lib/user";

export function LoyaltyProgress({ tier, purchasesCount }: { tier: LoyaltyTier; purchasesCount: number }) {
  const next = nextTier(tier);
  const progressPct = next
    ? Math.min(100, Math.round(((purchasesCount - tier.minPurchases) / (next.minPurchases - tier.minPurchases)) * 100))
    : 100;
  const remaining = next ? Math.max(0, next.minPurchases - purchasesCount) : 0;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div className={styles.tierBadge}>
          <span className={styles.tierIcon}>
            <AwardIcon />
          </span>
          <div>
            <div className={styles.tierName}>{tier.name}</div>
            <div className={styles.tierMeta}>{purchasesCount} compras realizadas</div>
          </div>
        </div>
        {tier.discountPct > 0 && (
          <span className={styles.discountPill}>{tier.discountPct}% de descuento</span>
        )}
      </div>

      <div className={styles.track}>
        <div className={styles.fill} style={{ "--progress": progressPct / 100 } as CSSProperties} />
      </div>
      <div className={styles.progressLabel}>
        {next ? (
          <>
            <span>{purchasesCount} / {next.minPurchases} compras</span>
            <span>Faltan {remaining} para {next.name}</span>
          </>
        ) : (
          <span>Nivel máximo alcanzado</span>
        )}
      </div>

      <div className={styles.benefits}>
        <div className={styles.benefitCol}>
          <h4>Beneficio actual</h4>
          <ul>
            {tier.benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
        <div className={`${styles.benefitCol} ${styles.next}`}>
          <h4>Próximo nivel</h4>
          {next ? (
            <ul>
              {next.benefits.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.maxed}>Ya desbloqueaste todos los beneficios.</p>
          )}
        </div>
      </div>
    </div>
  );
}

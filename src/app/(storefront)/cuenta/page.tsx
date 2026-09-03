import type { Metadata } from "next";
import Link from "next/link";
import styles from "./account.module.css";
import { AccountShell } from "@/components/AccountShell";
import { LoyaltyProgress } from "@/components/LoyaltyProgress";
import { OrderRow } from "@/components/OrderRow";
import { requireUser } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { listOrdersForUser } from "@/server/services/checkout-service";
import { formatCop } from "@/lib/products";
import { tierForPurchases } from "@/lib/user";

export const metadata: Metadata = { title: "Mi cuenta — BombaLoot" };

export default async function AccountSummaryPage() {
  const user = await requireUser("/cuenta");
  const tier = tierForPurchases(user.purchasesCount);
  const displayName = user.name?.trim() || user.email;

  const orders = await listOrdersForUser(getPool(), user.userId);
  const totalSpent = orders
    .filter((o) => o.orderStatus === "COMPLETED" || o.orderStatus === "PAID_PENDING_DELIVERY")
    .reduce((s, o) => s + o.totalCop, 0);
  const recentOrders = orders.slice(0, 3);

  return (
    <AccountShell user={user}>
      <div className={styles.pageHead}>
        <h1>Hola, {displayName.split(" ")[0]}</h1>
        <p>{user.email}</p>
      </div>

      <div className={styles.section}>
        <div className={styles.statGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Compras realizadas</div>
            <div className={`${styles.statValue} num-display`}>{user.purchasesCount}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Nivel actual</div>
            <div className={styles.statValue}>{tier.name}</div>
            {tier.discountPct > 0 && (
              <div className={styles.statNote}>{tier.discountPct}% de descuento activo</div>
            )}
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Gasto total</div>
            <div className={`${styles.statValue} num-display`}>{formatCop(totalSpent)}</div>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Fidelización</h2>
          <Link href="/cuenta/fidelizacion" className={styles.sectionLink}>
            Ver detalle →
          </Link>
        </div>
        <LoyaltyProgress tier={tier} purchasesCount={user.purchasesCount} />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Pedidos recientes</h2>
          <Link href="/cuenta/pedidos" className={styles.sectionLink}>
            Ver todos →
          </Link>
        </div>
        <div className={styles.orderList}>
          {recentOrders.map((order) => (
            <OrderRow order={order} prefetch={false} key={order.orderId} />
          ))}
        </div>
      </div>
    </AccountShell>
  );
}

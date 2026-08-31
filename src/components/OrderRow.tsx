import Link from "next/link";
import styles from "./OrderRow.module.css";
import { StatusPill } from "./StatusPill";
import { ChevronRightIcon } from "./icons";
import { DELIVERY_STATUS_META, PAYMENT_STATUS_META, orderItemsSummary, type Order } from "@/lib/orders";
import { formatCop } from "@/lib/products";

export function OrderRow({ order }: { order: Order }) {
  const payment = PAYMENT_STATUS_META[order.paymentStatus];
  const delivery = DELIVERY_STATUS_META[order.deliveryStatus];

  return (
    <Link href={`/cuenta/pedidos/${order.id}`} className={styles.row}>
      <div className={styles.main}>
        <div className={styles.top}>
          <span className={styles.id}>#{order.id}</span>
          <span className={styles.date}>
            {new Date(order.date).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </div>
        <div className={styles.items}>{orderItemsSummary(order)}</div>
        <div className={styles.statusRow}>
          <StatusPill tone={payment.tone}>{payment.label}</StatusPill>
          {order.paymentStatus === "paid" && <StatusPill tone={delivery.tone}>{delivery.label}</StatusPill>}
        </div>
      </div>
      <div className={styles.right}>
        <span className={`${styles.total} num-display`}>{formatCop(order.totalCop)}</span>
        <ChevronRightIcon className={styles.chevron} />
      </div>
    </Link>
  );
}

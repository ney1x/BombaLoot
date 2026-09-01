import Link from "next/link";
import styles from "./OrderRow.module.css";
import { StatusPill } from "./StatusPill";
import { ChevronRightIcon } from "./icons";
import { formatCop } from "@/lib/products";
import type { OrderStatus } from "@/server/services/checkout-service";

export interface OrderRowData {
  orderId: string;
  orderNumber: string;
  createdAt: Date | string;
  totalCop: number;
  orderStatus: OrderStatus;
  items: Array<{ gameLabel: string; denomination: string; unit: string; quantity: number }>;
}

const PAYMENT_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pago pendiente",
  PAYMENT_EXPIRED: "Pago vencido",
  PAID_PENDING_DELIVERY: "Pago confirmado",
  PAID_AWAITING_REFUND: "Pago confirmado",
  COMPLETED: "Pago confirmado",
  FAILED: "Pago rechazado",
  REFUNDED: "Reembolsado",
};

const PAYMENT_TONE: Record<OrderStatus, "good" | "warn" | "bad"> = {
  PENDING_PAYMENT: "warn",
  PAYMENT_EXPIRED: "bad",
  PAID_PENDING_DELIVERY: "good",
  PAID_AWAITING_REFUND: "good",
  COMPLETED: "good",
  FAILED: "bad",
  REFUNDED: "warn",
};

const DELIVERED_STATUSES: OrderStatus[] = ["COMPLETED"];

function itemsSummary(items: OrderRowData["items"]): string {
  return items.map((i) => `${i.gameLabel} ${i.denomination} ${i.unit} ×${i.quantity}`).join(", ");
}

export function OrderRow({ order }: { order: OrderRowData }) {
  const delivered = DELIVERED_STATUSES.includes(order.orderStatus);

  return (
    <Link href={`/cuenta/pedidos/${order.orderId}`} className={styles.row}>
      <div className={styles.main}>
        <div className={styles.top}>
          <span className={styles.id}>#{order.orderNumber}</span>
          <span className={styles.date}>
            {new Date(order.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </div>
        <div className={styles.items}>{itemsSummary(order.items)}</div>
        <div className={styles.statusRow}>
          <StatusPill tone={PAYMENT_TONE[order.orderStatus]}>{PAYMENT_LABEL[order.orderStatus]}</StatusPill>
          {(delivered || order.orderStatus === "PAID_PENDING_DELIVERY") && (
            <StatusPill tone={delivered ? "good" : "neutral"}>
              {delivered ? "Entregado" : "Por entregar"}
            </StatusPill>
          )}
        </div>
      </div>
      <div className={styles.right}>
        <span className={`${styles.total} num-display`}>{formatCop(order.totalCop)}</span>
        <ChevronRightIcon className={styles.chevron} />
      </div>
    </Link>
  );
}

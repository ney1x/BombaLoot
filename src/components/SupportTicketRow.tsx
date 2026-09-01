import Link from "next/link";
import styles from "./OrderRow.module.css";
import { StatusPill } from "./StatusPill";
import { ChevronRightIcon } from "./icons";
import { SUPPORT_CATEGORY_LABEL, SUPPORT_STATUS_LABEL, SUPPORT_STATUS_TONE, type SupportCategory } from "@/lib/support";

export interface SupportTicketRowData {
  id: string;
  ticketNumber: string;
  category: string;
  status: string;
  orderNumber: string | null;
  createdAt: Date | string;
}

/** Mismas clases que `OrderRow` — misma fila de lista, otro contenido. */
export function SupportTicketRow({ ticket }: { ticket: SupportTicketRowData }) {
  return (
    <Link href={`/cuenta/soporte/${ticket.id}`} className={styles.row}>
      <div className={styles.main}>
        <div className={styles.top}>
          <span className={styles.id}>#{ticket.ticketNumber}</span>
          <span className={styles.date}>
            {new Date(ticket.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </div>
        <div className={styles.items}>
          {SUPPORT_CATEGORY_LABEL[ticket.category as SupportCategory] ?? ticket.category}
          {ticket.orderNumber ? ` · Pedido #${ticket.orderNumber}` : ""}
        </div>
        <div className={styles.statusRow}>
          <StatusPill tone={SUPPORT_STATUS_TONE[ticket.status] ?? "neutral"}>
            {SUPPORT_STATUS_LABEL[ticket.status] ?? ticket.status}
          </StatusPill>
        </div>
      </div>
      <div className={styles.right}>
        <ChevronRightIcon className={styles.chevron} />
      </div>
    </Link>
  );
}

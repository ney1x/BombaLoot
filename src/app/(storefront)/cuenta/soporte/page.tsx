import type { Metadata } from "next";
import Link from "next/link";
import styles from "../account.module.css";
import { AccountShell } from "@/components/AccountShell";
import { EmptyState } from "@/components/EmptyState";
import { HeadsetIcon } from "@/components/icons";
import { SupportTicketRow } from "@/components/SupportTicketRow";
import { requireUser } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { listTicketsForUser } from "@/server/services/support-service";

export const metadata: Metadata = { title: "Mis solicitudes — bombaloot" };

export default async function AccountSupportPage() {
  const user = await requireUser("/cuenta/soporte");
  const tickets = await listTicketsForUser(getPool(), user.userId);

  return (
    <AccountShell user={user}>
      <div className={styles.pageHead}>
        <h1>Mis solicitudes</h1>
        <p>Conversaciones con soporte sobre tus pedidos.</p>
      </div>

      {tickets.length === 0 ? (
        <EmptyState
          icon={HeadsetIcon}
          title="Todavía no abriste ninguna solicitud"
          body="Si tenés un problema con una compra, contanos qué pasó desde Ayuda."
          actionHref="/ayuda"
          actionLabel="Ir a Ayuda"
        />
      ) : (
        <>
          <div className={styles.orderList}>
            {tickets.map((t) => (
              <SupportTicketRow
                ticket={{
                  id: t.id,
                  ticketNumber: t.ticketNumber,
                  category: t.category,
                  status: t.status,
                  orderNumber: t.orderNumber,
                  createdAt: t.createdAt,
                }}
                key={t.id}
              />
            ))}
          </div>
          <p style={{ marginTop: 16 }}>
            <Link href="/ayuda">Abrir una nueva solicitud →</Link>
          </p>
        </>
      )}
    </AccountShell>
  );
}

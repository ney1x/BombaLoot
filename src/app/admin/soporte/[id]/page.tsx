import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import shared from "../../shared.module.css";
import { AdminSupportThread } from "@/components/admin/AdminSupportThread";
import { getCurrentSession } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { SUPPORT_CATEGORY_LABEL, type SupportCategory } from "@/lib/support";
import { getTicketAdmin, listMessages } from "@/server/services/support-service";

export const metadata: Metadata = { title: "Ticket de soporte — Admin bombaloot" };

export default async function AdminSupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [session, ticket] = await Promise.all([getCurrentSession(), getTicketAdmin(db, id)]);
  if (!ticket || !session) notFound();

  const messages = await listMessages(db, id);

  return (
    <div className={shared.page}>
      <Link href="/admin/soporte" className={shared.backLink}>
        ← Soporte
      </Link>

      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Ticket {ticket.ticketNumber}</h1>
          <p className={shared.subtitle}>
            {ticket.email} · {SUPPORT_CATEGORY_LABEL[ticket.category as SupportCategory] ?? ticket.category}
            {ticket.orderNumber && (
              <>
                {" · "}
                <Link href={`/admin/pedidos/${ticket.orderId}`} className={shared.mono}>
                  {ticket.orderNumber}
                </Link>
              </>
            )}
            {ticket.orderNumberInput && !ticket.orderNumber && (
              <> · pedido mencionado (no encontrado): {ticket.orderNumberInput}</>
            )}
          </p>
        </div>
      </div>

      <AdminSupportThread
        ticketId={ticket.id}
        currentUserId={session.userId}
        currentUserEmail={session.email}
        initialTicket={{
          id: ticket.id,
          status: ticket.status,
          assignedTo: ticket.assignedTo,
          assignedToEmail: ticket.assignedToEmail,
        }}
        initialMessages={messages.map((m) => ({
          id: m.id,
          senderType: m.senderType,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}

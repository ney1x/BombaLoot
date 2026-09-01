import type { Metadata } from "next";
import Link from "next/link";
import shared from "../shared.module.css";
import { getDb } from "@/server/db/client";
import { SUPPORT_CATEGORY_LABEL, SUPPORT_STATUS_LABEL, SUPPORT_STATUS_TONE, type SupportCategory } from "@/lib/support";
import { listTicketsAdmin } from "@/server/services/support-service";

export const metadata: Metadata = { title: "Soporte — Admin Loadout" };

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const tickets = await listTicketsAdmin(getDb(), { status: raw.status || undefined, q: raw.q || undefined });

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Soporte</h1>
          <p className={shared.subtitle}>{tickets.length} ticket(s)</p>
        </div>
      </div>

      <form className={shared.filterForm} method="get">
        <input type="text" name="q" placeholder="Ticket, email o pedido" defaultValue={raw.q ?? ""} />
        <select name="status" defaultValue={raw.status ?? ""}>
          <option value="">Todos los estados</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {SUPPORT_STATUS_LABEL[s] ?? s}
            </option>
          ))}
        </select>
        <button type="submit" className={shared.btnSmall}>
          Filtrar
        </button>
        <Link href="/admin/soporte" className={shared.btnSmall}>
          Limpiar
        </Link>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {tickets.map((t) => (
          <Link key={t.id} href={`/admin/soporte/${t.id}`} className={shared.card} style={{ display: "block" }}>
            <div className={shared.headRow}>
              <div>
                <span className={shared.mono}>{t.ticketNumber}</span>
                <p className={shared.subtitle}>
                  {t.email} · {SUPPORT_CATEGORY_LABEL[t.category as SupportCategory] ?? t.category}
                  {t.orderNumber ? ` · Pedido ${t.orderNumber}` : ""} · última actividad{" "}
                  {t.lastMessageAt.toLocaleString("es-CO")}
                  {t.assignedToEmail ? ` · asignado a ${t.assignedToEmail}` : ""}
                </p>
              </div>
              <span className={shared.badge} data-tone={SUPPORT_STATUS_TONE[t.status]}>
                {SUPPORT_STATUS_LABEL[t.status] ?? t.status}
              </span>
            </div>
          </Link>
        ))}

        {tickets.length === 0 && <div className={shared.empty}>Sin tickets de soporte.</div>}
      </div>
    </div>
  );
}

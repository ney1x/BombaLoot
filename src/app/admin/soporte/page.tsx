import type { Metadata } from "next";
import Link from "next/link";
import shared from "../shared.module.css";
import { getDb } from "@/server/db/client";
import { SUPPORT_CATEGORY_LABEL, SUPPORT_STATUS_LABEL, SUPPORT_STATUS_TONE, type SupportCategory } from "@/lib/support";
import { listTicketsAdmin } from "@/server/services/support-service";

export const metadata: Metadata = { title: "Soporte — Admin BombaLoot" };

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
        {tickets.map((t) => {
          const waiting = t.lastMessageSender === "CUSTOMER" && (t.status === "OPEN" || t.status === "IN_PROGRESS");
          const category = SUPPORT_CATEGORY_LABEL[t.category as SupportCategory] ?? t.category;
          const statusLabel = SUPPORT_STATUS_LABEL[t.status] ?? t.status;
          const ariaLabel = [
            `Ticket ${t.ticketNumber}`,
            `estado ${statusLabel}`,
            waiting ? "esperando nuestra respuesta" : null,
            `cliente ${t.email}`,
            `motivo ${category}`,
            t.orderNumber ? `pedido ${t.orderNumber}` : null,
            `última actividad ${t.lastMessageAt.toLocaleString("es-CO")}`,
            t.assignedToEmail ? `asignado a ${t.assignedToEmail}` : null,
          ]
            .filter(Boolean)
            .join(", ");

          return (
            <Link
              key={t.id}
              href={`/admin/soporte/${t.id}`}
              className={shared.card}
              style={{ display: "block" }}
              aria-label={ariaLabel}
            >
              <div className={shared.headRow}>
                <div>
                  <span className={shared.mono}>{t.ticketNumber}</span>
                  <div
                    aria-hidden="true"
                    style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 4 }}
                    className={shared.subtitle}
                  >
                    <span>{t.email}</span>
                    <span>{category}</span>
                    {t.orderNumber && (
                      <span style={{ color: "var(--accent)", fontWeight: 600 }}>Pedido {t.orderNumber}</span>
                    )}
                    <span>Actividad: {t.lastMessageAt.toLocaleString("es-CO")}</span>
                    {t.assignedToEmail && <span>Asignado a {t.assignedToEmail}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {waiting && (
                    <span className={shared.badge} data-tone="bad">
                      Esperando respuesta
                    </span>
                  )}
                  <span className={shared.badge} data-tone={SUPPORT_STATUS_TONE[t.status]}>
                    {statusLabel}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}

        {tickets.length === 0 && <div className={shared.empty}>Sin tickets de soporte.</div>}
      </div>
    </div>
  );
}

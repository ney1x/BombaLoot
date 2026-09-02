import type { Metadata } from "next";
import Link from "next/link";
import shared from "../shared.module.css";
import { getCurrentSession } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { formatCop } from "@/lib/products";
import { listRefundsAdmin } from "@/server/services/admin-refunds";
import { ManualRefundAction } from "@/components/admin/ManualRefundAction";

export const metadata: Metadata = { title: "Reembolsos — Admin bombaloot" };

const STATUS_LABEL: Record<string, string> = {
  PENDING_REFUND: "PENDIENTE",
  REFUND_INITIATED: "INICIADO",
  REFUND_COMPLETED: "COMPLETADO",
  REFUND_FAILED: "FALLIDO",
  MANUAL_REVIEW_REQUIRED: "REVISIÓN MANUAL",
  CANCELLED: "CANCELADO",
};

const STATUS_TONE: Record<string, string | undefined> = {
  PENDING_REFUND: "warn",
  REFUND_INITIATED: "warn",
  REFUND_COMPLETED: "good",
  REFUND_FAILED: "bad",
  MANUAL_REVIEW_REQUIRED: "bad",
  CANCELLED: undefined,
};

export default async function AdminRefundsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const [session, refunds] = await Promise.all([
    getCurrentSession(),
    listRefundsAdmin(getDb(), raw.status || undefined),
  ]);
  const canExecute = session?.role === "ADMIN";

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Reembolsos</h1>
          <p className={shared.subtitle}>{refunds.length} solicitud(es)</p>
        </div>
      </div>

      <form className={shared.filterForm} method="get">
        <select name="status" defaultValue={raw.status ?? ""}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className={shared.btnSmall}>
          Filtrar
        </button>
        <Link href="/admin/reembolsos" className={shared.btnSmall}>
          Limpiar
        </Link>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {refunds.map((r) => (
          <div key={r.id} className={shared.card}>
            <div className={shared.headRow}>
              <div>
                <Link href={`/admin/pedidos/${r.orderId}`} className={shared.mono}>
                  {r.orderNumber}
                </Link>
                <p className={shared.subtitle}>
                  {r.email} · {r.provider} · {r.amountCop ? formatCop(r.amountCop) : "—"} {r.currency} ·{" "}
                  solicitado {r.requestedAt.toLocaleString("es-CO")}
                </p>
                {r.errorMessage && <p className={shared.subtitle}>Motivo: {r.errorMessage}</p>}
              </div>
              <span className={shared.badge} data-tone={STATUS_TONE[r.status]}>
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
            </div>

            {r.status === "MANUAL_REVIEW_REQUIRED" && (
              <div style={{ marginTop: 12 }}>
                <ManualRefundAction
                  canExecute={canExecute}
                  refund={{
                    id: r.id,
                    orderId: r.orderId,
                    orderNumber: r.orderNumber,
                    email: r.email,
                    provider: r.provider,
                    amountCop: r.amountCop,
                    currency: r.currency,
                    formattedAmount: r.amountCop ? formatCop(r.amountCop) : `? ${r.currency}`,
                  }}
                />
              </div>
            )}
          </div>
        ))}

        {refunds.length === 0 && <div className={shared.empty}>Sin solicitudes de reembolso.</div>}
      </div>
    </div>
  );
}

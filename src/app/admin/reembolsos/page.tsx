import type { Metadata } from "next";
import Link from "next/link";
import shared from "../shared.module.css";
import { STATUS_LABEL, STATUS_TONE } from "../refund-status-labels";
import { getCurrentSession } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { formatCop } from "@/lib/products";
import { listRefundsAdmin } from "@/server/services/admin-refunds";
import { ManualRefundAction } from "@/components/admin/ManualRefundAction";

export const metadata: Metadata = { title: "Reembolsos — Admin BombaLoot" };

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
        {refunds.map((r) => {
          const needsAction = r.status === "MANUAL_REVIEW_REQUIRED";
          return (
            <div
              key={r.id}
              className={shared.card}
              style={
                needsAction
                  ? { borderColor: "var(--alert)", background: "color-mix(in srgb, var(--alert-soft) 35%, var(--surface))" }
                  : undefined
              }
            >
              <div className={shared.headRow}>
                <div>
                  <Link href={`/admin/pedidos/${r.orderId}`} className={shared.mono}>
                    {r.orderNumber}
                  </Link>
                  <p className={shared.subtitle}>
                    {r.email} · {r.provider} · {r.amountCop ? formatCop(r.amountCop) : "—"} {r.currency} ·{" "}
                    solicitado {r.requestedAt.toLocaleString("es-CO")}
                  </p>
                  {r.errorMessage && (
                    <p className={shared.formMsg} data-tone="bad" style={{ marginTop: 6 }}>
                      Por qué necesita revisión manual: {r.errorMessage}
                    </p>
                  )}
                </div>
                <span className={shared.badge} data-tone={STATUS_TONE[r.status]}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>

              {needsAction && (
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
                      formattedAmount: r.amountCop ? formatCop(r.amountCop) : null,
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {refunds.length === 0 && <div className={shared.empty}>Sin solicitudes de reembolso.</div>}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import styles from "../dashboard.module.css";
import shared from "../shared.module.css";
import { requireAdmin } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { formatCop } from "@/lib/products";
import { getAdminEarnings } from "@/server/services/admin-dashboard";
import { getPaidByAdmin, listRecentPayouts } from "@/server/services/admin-payouts";
import { AdminPayoutForm } from "@/components/admin/AdminPayoutForm";

export const metadata: Metadata = { title: "Pagos — Admin BombaLoot" };

/**
 * Ventas por admin + liquidaciones: cuánto generó cada admin con los códigos
 * que cargó, cuánto ya se le transfirió y cuánto se le debe. ADMIN-only
 * (SUPPORT no ve plata); registrar un pago además exige SUPERADMIN.
 */
export default async function AdminPayoutsPage() {
  const session = await requireAdmin();
  const [earnings, paidByAdmin, recentPayouts] = await Promise.all([
    getAdminEarnings(getDb()),
    getPaidByAdmin(getDb()),
    listRecentPayouts(getDb()),
  ]);

  const paidOf = (adminId: string | null) => (adminId ? (paidByAdmin.get(adminId) ?? 0) : 0);

  const earningsTotal = earnings.reduce(
    (acc, e) => ({
      codesSoldMonth: acc.codesSoldMonth + e.codesSoldMonth,
      revenueMonthCop: acc.revenueMonthCop + e.revenueMonthCop,
      netMonthCop: acc.netMonthCop + e.netMonthCop,
      codesSoldAllTime: acc.codesSoldAllTime + e.codesSoldAllTime,
      revenueAllTimeCop: acc.revenueAllTimeCop + e.revenueAllTimeCop,
      netAllTimeCop: acc.netAllTimeCop + e.netAllTimeCop,
      paidCop: acc.paidCop + paidOf(e.adminId),
    }),
    { codesSoldMonth: 0, revenueMonthCop: 0, netMonthCop: 0, codesSoldAllTime: 0, revenueAllTimeCop: 0, netAllTimeCop: 0, paidCop: 0 },
  );


  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Pagos</h1>

      <div className={styles.metricGroups}>
        <section className={styles.metricGroup}>
          <h2 className={styles.sectionTitle}>Ventas por admin</h2>
          <p className={shared.subtitle}>
            A quién se le atribuye cada venta: el admin que cargó el código concreto que se vendió, no el
            producto — así que dos admins pueden vender del mismo producto sin mezclarse.
          </p>
          <p className={shared.subtitle}>
            Neto = descontada la comisión del proveedor de pago del pedido correspondiente, a prorrata si el
            pedido mezcla códigos de más de un admin. La de Wompi es un estimado (tarifa editable en el Dashboard); la de
            PayPal es la exacta que ellos mismos informan.
          </p>
          <div className={shared.tableWrap} style={{ marginTop: 10 }}>
            <table className={shared.table}>
              <thead>
                <tr>
                  <th scope="col">Admin</th>
                  <th scope="col">Códigos (mes)</th>
                  <th scope="col">Bruto del mes</th>
                  <th scope="col">Neto del mes</th>
                  <th scope="col">Códigos (total)</th>
                  <th scope="col">Bruto total</th>
                  <th scope="col">Neto total</th>
                  <th scope="col">Pagado</th>
                  <th scope="col">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {earnings.map((e) => (
                  <tr key={e.adminId ?? "sin-asignar"}>
                    <td>{e.adminLabel}</td>
                    <td className="num-display">{e.codesSoldMonth}</td>
                    <td className="num-display">{formatCop(e.revenueMonthCop)}</td>
                    <td className="num-display">{formatCop(e.netMonthCop)}</td>
                    <td className="num-display">{e.codesSoldAllTime}</td>
                    <td className="num-display">{formatCop(e.revenueAllTimeCop)}</td>
                    <td className="num-display">{formatCop(e.netAllTimeCop)}</td>
                    <td className="num-display">{formatCop(paidOf(e.adminId))}</td>
                    <td className="num-display">{formatCop(e.netAllTimeCop - paidOf(e.adminId))}</td>
                  </tr>
                ))}
                {earnings.length === 0 && (
                  <tr>
                    <td colSpan={9} className={shared.empty}>
                      Sin códigos vendidos todavía.
                    </td>
                  </tr>
                )}
                {earnings.length > 0 && (
                  <tr style={{ fontWeight: 700 }}>
                    <td>Total combinado</td>
                    <td className="num-display">{earningsTotal.codesSoldMonth}</td>
                    <td className="num-display">{formatCop(earningsTotal.revenueMonthCop)}</td>
                    <td className="num-display">{formatCop(earningsTotal.netMonthCop)}</td>
                    <td className="num-display">{earningsTotal.codesSoldAllTime}</td>
                    <td className="num-display">{formatCop(earningsTotal.revenueAllTimeCop)}</td>
                    <td className="num-display">{formatCop(earningsTotal.netAllTimeCop)}</td>
                    <td className="num-display">{formatCop(earningsTotal.paidCop)}</td>
                    <td className="num-display">{formatCop(earningsTotal.netAllTimeCop - earningsTotal.paidCop)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.metricGroup}>
          <h2 className={styles.sectionTitle}>Pagos a admins</h2>
          <p className={shared.subtitle}>
            Pendiente = neto total − lo ya transferido. La plata entra a la cuenta del proveedor de pago y la
            transferencia a cada admin se hace por fuera; acá solo se anota.
          </p>
          {session?.role === "SUPERADMIN" && (
            <AdminPayoutForm
              admins={earnings.flatMap((e) =>
                e.adminId
                  ? [{ id: e.adminId, label: e.adminLabel, pendingCop: e.netAllTimeCop - paidOf(e.adminId) }]
                  : [],
              )}
            />
          )}
          <div className={shared.tableWrap} style={{ marginTop: 10 }}>
            <table className={shared.table}>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Admin</th>
                  <th scope="col">Monto</th>
                  <th scope="col">Medio</th>
                  <th scope="col">Referencia</th>
                  <th scope="col">Registró</th>
                </tr>
              </thead>
              <tbody>
                {recentPayouts.map((p) => (
                  <tr key={p.id}>
                    <td>{p.createdAt.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td>{p.adminLabel}</td>
                    <td className="num-display">{formatCop(p.amountCop)}</td>
                    <td>{p.method}</td>
                    <td title={p.note ?? undefined}>{p.reference ?? "—"}</td>
                    <td>{p.createdByLabel ?? "—"}</td>
                  </tr>
                ))}
                {recentPayouts.length === 0 && (
                  <tr>
                    <td colSpan={6} className={shared.empty}>
                      Sin pagos registrados todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

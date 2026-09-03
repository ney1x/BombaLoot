import type { Metadata } from "next";
import Link from "next/link";
import shared from "../shared.module.css";
import { STATUS_LABEL, STATUS_TONE } from "../order-status-labels";
import { getDb } from "@/server/db/client";
import { formatCop } from "@/lib/products";
import { listOrdersAdmin, orderFiltersSchema, type OrderFilters } from "@/server/services/admin-orders";

export const metadata: Metadata = { title: "Pedidos — Admin BombaLoot" };

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = orderFiltersSchema.safeParse({
    orderNumber: raw.orderNumber || undefined,
    email: raw.email || undefined,
    status: raw.status || undefined,
    paymentMethod: raw.paymentMethod || undefined,
    owner: raw.owner || undefined,
    dateFrom: raw.dateFrom ? new Date(raw.dateFrom).toISOString() : undefined,
    dateTo: raw.dateTo ? new Date(`${raw.dateTo}T23:59:59.999`).toISOString() : undefined,
  });
  const filters: OrderFilters = parsed.success
    ? parsed.data
    : { limit: 50 };

  const orders = await listOrdersAdmin(getDb(), filters);

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Pedidos</h1>
          <p className={shared.subtitle}>{orders.length} resultado(s)</p>
        </div>
      </div>

      <form className={shared.filterForm} method="get">
        <input name="orderNumber" placeholder="Número de pedido" defaultValue={raw.orderNumber ?? ""} />
        <input name="email" placeholder="Email" defaultValue={raw.email ?? ""} />
        <select name="status" defaultValue={raw.status ?? ""}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="paymentMethod" defaultValue={raw.paymentMethod ?? ""}>
          <option value="">Cualquier método</option>
          <option value="wompi">Wompi</option>
          <option value="paypal">PayPal</option>
        </select>
        <select name="owner" defaultValue={raw.owner ?? ""}>
          <option value="">Cuenta o invitado</option>
          <option value="user">Con cuenta</option>
          <option value="guest">Invitado</option>
        </select>
        <div className={shared.field} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <label htmlFor="dateFrom" className={shared.subtitle} style={{ marginTop: 0 }}>
            Desde
          </label>
          <input id="dateFrom" type="date" name="dateFrom" defaultValue={raw.dateFrom ?? ""} />
        </div>
        <div className={shared.field} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <label htmlFor="dateTo" className={shared.subtitle} style={{ marginTop: 0 }}>
            Hasta
          </label>
          <input id="dateTo" type="date" name="dateTo" defaultValue={raw.dateTo ?? ""} />
        </div>
        <button type="submit" className={shared.btnSmall}>
          Filtrar
        </button>
        <Link href="/admin/pedidos" className={shared.btnSmall}>
          Limpiar
        </Link>
      </form>
      <p className={shared.subtitle}>Los filtros se combinan entre sí (Y, no O) — más filtros, menos resultados.</p>

      <div className={shared.tableWrap}>
        <table className={shared.table}>
          <thead>
            <tr>
              <th scope="col">Pedido</th>
              <th scope="col">Email</th>
              <th scope="col">Total</th>
              <th scope="col">Método</th>
              <th scope="col">Estado</th>
              <th scope="col">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.orderId}>
                <td>
                  <Link href={`/admin/pedidos/${o.orderId}`} className={shared.mono}>
                    {o.orderNumber}
                  </Link>
                </td>
                <td>{o.email}</td>
                <td className="num-display">{formatCop(o.totalCop)}</td>
                <td>{o.paymentMethod ?? "—"}</td>
                <td>
                  <span className={shared.badge} data-tone={STATUS_TONE[o.orderStatus]}>
                    {STATUS_LABEL[o.orderStatus]}
                  </span>
                </td>
                <td>{o.createdAt.toLocaleDateString("es-CO")}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className={shared.empty}>
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import shared from "../../shared.module.css";
import { getDb } from "@/server/db/client";
import { formatCop } from "@/lib/products";
import { getOrderDetailAdmin } from "@/server/services/admin-orders";

export const metadata: Metadata = { title: "Detalle de pedido — Admin Loadout" };

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrderDetailAdmin(getDb(), id);
  if (!order) notFound();

  return (
    <div className={shared.page}>
      <Link href="/admin/pedidos" className={shared.backLink}>
        ← Pedidos
      </Link>

      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Pedido {order.orderNumber}</h1>
          <p className={shared.subtitle}>
            {order.email} · {order.userId ? "cuenta registrada" : "invitado"} ·{" "}
            {order.createdAt.toLocaleString("es-CO")}
          </p>
        </div>
        <span className={shared.badge} data-tone="accent">
          {order.orderStatus}
        </span>
      </div>

      <div className={shared.card}>
        <h2 className={shared.title} style={{ fontSize: 15 }}>
          Productos
        </h2>
        <div className={shared.tableWrap} style={{ marginTop: 10 }}>
          <table className={shared.table}>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Precio unitario</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i, idx) => (
                <tr key={idx}>
                  <td>
                    {i.gameLabel} · {i.denomination} {i.unit}
                  </td>
                  <td className="num-display">{i.quantity}</td>
                  <td className="num-display">{formatCop(i.unitPriceCop)}</td>
                  <td className="num-display">{formatCop(i.lineTotalCop)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 10, fontSize: 13 }}>
          Subtotal {formatCop(order.subtotalCop)} · Descuento {formatCop(order.discountCop)} · Total{" "}
          <b>{formatCop(order.totalCop)}</b>
        </p>
      </div>

      <div className={shared.card}>
        <h2 className={shared.title} style={{ fontSize: 15 }}>
          Códigos asociados
        </h2>
        <p className={shared.subtitle}>Solo se muestra el fingerprint — nunca el código en claro.</p>
        <div className={shared.tableWrap} style={{ marginTop: 10 }}>
          <table className={shared.table}>
            <thead>
              <tr>
                <th>Fingerprint</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {order.codes.map((c) => (
                <tr key={c.id}>
                  <td className={shared.mono}>{c.fingerprint}</td>
                  <td>
                    <span className={shared.badge}>{c.status}</span>
                  </td>
                </tr>
              ))}
              {order.codes.length === 0 && (
                <tr>
                  <td colSpan={2} className={shared.empty}>
                    Sin códigos asignados todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={shared.card}>
        <h2 className={shared.title} style={{ fontSize: 15 }}>
          Pagos
        </h2>
        <div className={shared.tableWrap} style={{ marginTop: 10 }}>
          <table className={shared.table}>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Referencia</th>
                <th>Estado</th>
                <th>Monto</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {order.paymentIntents.map((p) => (
                <tr key={p.id}>
                  <td>{p.provider}</td>
                  <td className={shared.mono}>{p.providerRef ?? "—"}</td>
                  <td>{p.status}</td>
                  <td className="num-display">{formatCop(p.amountCop)}</td>
                  <td>{p.createdAt.toLocaleString("es-CO")}</td>
                </tr>
              ))}
              {order.paymentIntents.length === 0 && (
                <tr>
                  <td colSpan={5} className={shared.empty}>
                    Sin intentos de pago.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {order.refundRequests.length > 0 && (
        <div className={shared.card}>
          <h2 className={shared.title} style={{ fontSize: 15 }}>
            Reembolsos
          </h2>
          <div className={shared.tableWrap} style={{ marginTop: 10 }}>
            <table className={shared.table}>
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Proveedor</th>
                  <th>Monto</th>
                  <th>Solicitado</th>
                </tr>
              </thead>
              <tbody>
                {order.refundRequests.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href="/admin/reembolsos" className={shared.badge}>
                        {r.status}
                      </Link>
                    </td>
                    <td>{r.provider}</td>
                    <td className="num-display">{r.amountCop ? formatCop(r.amountCop) : "—"}</td>
                    <td>{r.requestedAt.toLocaleString("es-CO")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={shared.card}>
        <h2 className={shared.title} style={{ fontSize: 15 }}>
          Timeline / auditoría
        </h2>
        <div className={shared.tableWrap} style={{ marginTop: 10 }}>
          <table className={shared.table}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Actor</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {order.auditLog.map((a) => (
                <tr key={a.id}>
                  <td>{a.occurredAt.toLocaleString("es-CO")}</td>
                  <td>{a.actorType}</td>
                  <td className={shared.mono}>{a.action}</td>
                </tr>
              ))}
              {order.auditLog.length === 0 && (
                <tr>
                  <td colSpan={3} className={shared.empty}>
                    Sin eventos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

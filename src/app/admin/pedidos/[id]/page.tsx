import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import shared from "../../shared.module.css";
import { STATUS_LABEL, STATUS_TONE } from "../../order-status-labels";
import { STATUS_LABEL as CODE_STATUS_LABEL, STATUS_TONE as CODE_STATUS_TONE } from "../../code-status-labels";
import {
  STATUS_LABEL as PAYMENT_STATUS_LABEL,
  STATUS_TONE as PAYMENT_STATUS_TONE,
} from "../../payment-intent-status-labels";
import { STATUS_LABEL as REFUND_STATUS_LABEL, STATUS_TONE as REFUND_STATUS_TONE } from "../../refund-status-labels";
import { getDb } from "@/server/db/client";
import { formatCop } from "@/lib/products";
import { getOrderDetailAdmin } from "@/server/services/admin-orders";
import { CancelFraudAction } from "@/components/admin/CancelFraudAction";
import { ResendCodesAction } from "@/components/admin/ResendCodesAction";

export const metadata: Metadata = { title: "Detalle de pedido — Admin bombaloot" };

const AUDIT_LOG_CAP = 100;

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrderDetailAdmin(getDb(), id);
  if (!order) notFound();

  const refundsSection = order.refundRequests.length > 0 && (
    <div className={shared.card}>
      <h2 className={shared.title} style={{ fontSize: 15 }}>
        Reembolsos
      </h2>
      <div className={shared.tableWrap} style={{ marginTop: 10 }}>
        <table className={shared.table}>
          <thead>
            <tr>
              <th scope="col">Estado</th>
              <th scope="col">Proveedor</th>
              <th scope="col">Monto</th>
              <th scope="col">Solicitado</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {order.refundRequests.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className={shared.badge} data-tone={REFUND_STATUS_TONE[r.status]}>
                    {REFUND_STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
                <td>{r.provider}</td>
                <td className="num-display">{r.amountCop ? formatCop(r.amountCop) : "—"}</td>
                <td>{r.requestedAt.toLocaleString("es-CO")}</td>
                <td>
                  <Link href="/admin/reembolsos" className={shared.btnSmall}>
                    Ver en Reembolsos
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className={shared.page}>
      <Link href="/admin/pedidos" className={shared.backLink}>
        ← Pedidos
      </Link>

      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Pedido {order.orderNumber}</h1>
          <p className={shared.subtitle}>
            {order.buyerName ?? order.email} · {order.email} ·{" "}
            {order.userId ? "cuenta registrada" : "invitado"} · pedido el {order.createdAt.toLocaleString("es-CO")}
          </p>
          <p className={shared.subtitle}>
            {order.paidAt ? `Pagado el ${order.paidAt.toLocaleString("es-CO")}` : "Sin pagar todavía"}
            {" · "}
            {order.deliveredAt ? `Entregado el ${order.deliveredAt.toLocaleString("es-CO")}` : "Código no entregado todavía"}
          </p>
        </div>
        <span className={shared.badge} data-tone={STATUS_TONE[order.orderStatus]}>
          {STATUS_LABEL[order.orderStatus] ?? order.orderStatus}
        </span>
      </div>

      {order.lastPaymentError && (
        <div className={shared.formMsg} data-tone="bad">
          Último error de pago: {order.lastPaymentError}
        </div>
      )}

      {order.paymentStatus === "PENDING" && (
        <div style={{ marginBottom: 20 }}>
          <CancelFraudAction orderId={order.orderId} expired={order.orderStatus === "PAYMENT_EXPIRED"} />
        </div>
      )}

      {refundsSection}

      <div className={shared.card}>
        <h2 className={shared.title} style={{ fontSize: 15 }}>
          Productos
        </h2>
        <div className={shared.tableWrap} style={{ marginTop: 10 }}>
          <table className={shared.table}>
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Precio unitario</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i, idx) => (
                <tr key={idx}>
                  <td>
                    <Link href={`/admin/productos/${i.productId}`}>
                      {i.gameLabel} · {i.denomination} {i.unit}
                    </Link>
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
        {order.deliveryStatus === "DELIVERED" && (
          <div style={{ marginTop: 10 }}>
            <ResendCodesAction orderId={order.orderId} orderEmail={order.email} />
          </div>
        )}
        <div className={shared.tableWrap} style={{ marginTop: 10 }}>
          <table className={shared.table}>
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Fingerprint</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {order.codes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/productos/${c.productId}`}>
                      {c.gameLabel} · {c.denomination} {c.unit}
                    </Link>
                  </td>
                  <td className={shared.mono}>{c.fingerprint}</td>
                  <td>
                    <span className={shared.badge} data-tone={CODE_STATUS_TONE[c.status]}>
                      {CODE_STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                </tr>
              ))}
              {order.codes.length === 0 && (
                <tr>
                  <td colSpan={3} className={shared.empty}>
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
                <th scope="col">Proveedor</th>
                <th scope="col">Referencia</th>
                <th scope="col">Estado</th>
                <th scope="col">Monto</th>
                <th scope="col">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {order.paymentIntents.map((p) => (
                <tr key={p.id}>
                  <td>{p.provider}</td>
                  <td className={shared.mono}>{p.providerRef ?? "—"}</td>
                  <td>
                    <span className={shared.badge} data-tone={PAYMENT_STATUS_TONE[p.status]}>
                      {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
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

      <div className={shared.card}>
        <h2 className={shared.title} style={{ fontSize: 15 }}>
          Timeline / auditoría
        </h2>
        {order.auditLog.length === AUDIT_LOG_CAP && (
          <p className={shared.subtitle}>Mostrando los últimos {AUDIT_LOG_CAP} eventos — puede haber más.</p>
        )}
        <div className={shared.tableWrap} style={{ marginTop: 10 }}>
          <table className={shared.table}>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Actor</th>
                <th scope="col">Acción</th>
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

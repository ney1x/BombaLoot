import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "./order-detail.module.css";
import { AccountShell } from "@/components/AccountShell";
import { CodeReveal } from "@/components/CodeReveal";
import { GameImageSlot } from "@/components/GameImageSlot";
import { StatusPill } from "@/components/StatusPill";
import { AlertIcon, ArrowLeftIcon, GAME_MARKS, PackageCheckIcon, ShieldCheckIcon } from "@/components/icons";
import { requireUser } from "@/server/auth/guards";
import { DELIVERY_STATUS_META, PAYMENT_STATUS_META, getOrder } from "@/lib/orders";
import { formatCop } from "@/lib/products";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Pedido #${id} — bombaloot` };
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/cuenta/pedidos/${id}`);
  const order = getOrder(id);
  if (!order) notFound();

  // IDOR: un CUSTOMER solo puede ver sus propios pedidos. Con la fase 5
  // (pedidos reales en la base) esto se vuelve `order.userId === user.userId`;
  // por ahora MOCK_ORDERS no tiene un dueño real más allá del email fijo del
  // catálogo de ejemplo, así que se compara contra eso — 404 y no 403, para
  // no confirmarle a nadie que el pedido existe.
  if (order.email.toLowerCase() !== user.email.toLowerCase()) notFound();

  const payment = PAYMENT_STATUS_META[order.paymentStatus];
  const delivery = DELIVERY_STATUS_META[order.deliveryStatus];
  const dateLabel = new Date(order.date).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const hasUnavailableCode = order.items.some((i) => i.codeStatus === "unavailable");

  return (
    <AccountShell user={user}>
      <Link href="/cuenta/pedidos" className={styles.crumb}>
        <ArrowLeftIcon /> Mis compras
      </Link>

      <div className={styles.head}>
        <h1>Pedido #{order.id}</h1>
      </div>
      <p className={styles.date}>{dateLabel}</p>

      <div className={styles.statusRow}>
        <StatusPill tone={payment.tone} icon={<ShieldCheckIcon />}>
          {payment.label}
        </StatusPill>
        {order.paymentStatus === "paid" && (
          <StatusPill tone={delivery.tone} icon={<PackageCheckIcon />}>
            {delivery.label}
          </StatusPill>
        )}
      </div>

      {order.paymentStatus === "failed" && (
        <div className={`${styles.banner} ${styles.bannerBad}`}>
          <AlertIcon />
          <div>
            <h3>El pago no pudo confirmarse</h3>
            <p>
              No te cobramos nada por este pedido. Podés intentarlo de nuevo desde el catálogo o
              escribirnos si el problema persiste.
            </p>
          </div>
        </div>
      )}

      {order.paymentStatus === "pending" && (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>
          <AlertIcon />
          <div>
            <h3>Esperando confirmación del pago</h3>
            <p>Apenas el proveedor de pago nos confirme, tu código va a aparecer acá automáticamente.</p>
          </div>
        </div>
      )}

      {hasUnavailableCode && (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>
          <AlertIcon />
          <div>
            <h3>Tu código no está disponible temporalmente</h3>
            <p>
              Hubo un problema al asignarlo. Ya lo estamos revisando — si en unas horas seguís sin
              verlo, <Link href="/soporte">contactá a soporte</Link> con el número de este pedido.
            </p>
          </div>
        </div>
      )}

      <div className={styles.card}>
        {order.items.map((item, i) => {
          const Mark = GAME_MARKS[item.gameId];
          return (
            <div className={styles.item} key={`${item.productId}-${i}`}>
              <div className={styles.imageWrap}>
                <GameImageSlot gameId={item.gameId} label={item.gameLabel} sizeHint="120×120" sizes="56px" />
              </div>
              <div className={styles.itemBody}>
                <span className={styles.itemGame}>
                  <Mark className={styles.mark} />
                  {item.gameLabel}
                </span>
                <div className={styles.itemDenom}>
                  <b className="num-display">{item.denomination}</b>
                  <span className={styles.itemUnit}>{item.unit}</span>
                </div>
                <div className={`${styles.itemMeta} num-display`}>
                  ×{item.quantity} · {formatCop(item.unitPriceCop)} c/u
                </div>

                {order.paymentStatus === "paid" && item.codeStatus === "available" && item.code && (
                  <CodeReveal code={item.code} />
                )}
              </div>
              <span className={`${styles.itemPrice} num-display`}>
                {formatCop(item.unitPriceCop * item.quantity)}
              </span>
            </div>
          );
        })}

        <div className={styles.totals}>
          <div className={styles.totalRow}>
            <span>Subtotal</span>
            <span className="num-display">{formatCop(order.subtotalCop)}</span>
          </div>
          <div className={styles.totalRow}>
            <span>Descuento</span>
            <span className="num-display">
              {order.discountCop > 0 ? `−${formatCop(order.discountCop)}` : formatCop(0)}
            </span>
          </div>
          <div className={`${styles.totalRow} ${styles.final}`}>
            <span>Total</span>
            <span className="num-display">{formatCop(order.totalCop)}</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Estado del pedido</div>
        <div className={styles.card}>
          <div className={styles.timeline}>
            <div className={`${styles.timelineStep} ${styles.done}`}>
              <span className={styles.timelineDot} />
              <div>
                <div className={styles.timelineLabel}>Pedido creado</div>
                <div className={styles.timelineNote}>{dateLabel}</div>
              </div>
            </div>
            <div className={`${styles.timelineStep} ${order.paymentStatus === "paid" ? styles.done : ""}`}>
              <span className={styles.timelineDot} />
              <div>
                <div className={styles.timelineLabel}>Pago confirmado</div>
                <div className={styles.timelineNote}>{payment.label}</div>
              </div>
            </div>
            <div className={`${styles.timelineStep} ${order.deliveryStatus === "delivered" ? styles.done : ""}`}>
              <span className={styles.timelineDot} />
              <div>
                <div className={styles.timelineLabel}>Código entregado</div>
                <div className={styles.timelineNote}>
                  {order.deliveryStatus === "delivered" ? "Disponible en este pedido" : "Todavía no"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AccountShell>
  );
}

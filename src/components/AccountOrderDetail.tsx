"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "@/app/(storefront)/cuenta/pedidos/[id]/order-detail.module.css";
import { CodeReveal } from "./CodeReveal";
import { GameImageSlot } from "./GameImageSlot";
import { StatusPill } from "./StatusPill";
import { AlertIcon, ArrowLeftIcon, GAME_MARKS, PackageCheckIcon, ShieldCheckIcon } from "./icons";
import { PRODUCTS, formatCop, type GameId } from "@/lib/products";

type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_EXPIRED"
  | "PAID_PENDING_DELIVERY"
  | "PAID_AWAITING_REFUND"
  | "COMPLETED"
  | "FAILED"
  | "REFUNDED";

interface OrderItem {
  productId: string;
  gameLabel: string;
  denomination: string;
  unit: string;
  quantity: number;
  unitPriceCop: number;
  lineTotalCop: number;
}

interface Order {
  orderId: string;
  orderNumber: string;
  email: string;
  subtotalCop: number;
  discountCop: number;
  totalCop: number;
  paymentStatus: string;
  deliveryStatus: string;
  orderStatus: OrderStatus;
  createdAt: string;
  items: OrderItem[];
}

const PAYMENT_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pago pendiente",
  PAYMENT_EXPIRED: "Pago vencido",
  PAID_PENDING_DELIVERY: "Pago confirmado",
  PAID_AWAITING_REFUND: "Pago confirmado",
  COMPLETED: "Pago confirmado",
  FAILED: "Pago rechazado",
  REFUNDED: "Reembolsado",
};

const PAYMENT_TONE: Record<OrderStatus, "good" | "warn" | "bad"> = {
  PENDING_PAYMENT: "warn",
  PAYMENT_EXPIRED: "bad",
  PAID_PENDING_DELIVERY: "good",
  PAID_AWAITING_REFUND: "good",
  COMPLETED: "good",
  FAILED: "bad",
  REFUNDED: "warn",
};

function gameIdFor(productId: string): GameId | undefined {
  return PRODUCTS.find((p) => p.id === productId)?.gameId;
}

/**
 * Detalle de pedido real para /cuenta/pedidos/[id] — hasta acá esta
 * pantalla vivía enteramente sobre `MOCK_ORDERS` (fase de diseño), aunque
 * `listOrdersForUser`/`getOrderForUser` y `/api/orders/[id]/codes` ya
 * existían y estaban listos exactamente para esto. Mismo patrón de
 * revelado que `OrderDeliveryReal` (el pedido primero, los códigos
 * después y solo si el pago ya está confirmado) — acá además agrupados
 * por producto en un array, no un valor único, mismo fix que ya se hizo
 * en esa pantalla para que comprar cantidad > 1 muestre todos los códigos.
 */
export function AccountOrderDetail({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [codes, setCodes] = useState<Record<string, string[]> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
        if (cancelled) return;
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const body = await res.json();
        setOrder(body.order as Order);
      } catch {
        if (!cancelled) setNotFound(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => {
    if (!order) return;
    if (order.orderStatus !== "PAID_PENDING_DELIVERY" && order.orderStatus !== "COMPLETED") return;
    if (codes) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${order.orderId}/codes`);
        if (!res.ok || cancelled) return;
        const body = await res.json();
        const map: Record<string, string[]> = {};
        for (const c of body.codes as Array<{ productId: string; code: string }>) {
          (map[c.productId] ??= []).push(c.code);
        }
        if (!cancelled) setCodes(map);
      } catch {
        // El resto del pedido igual se muestra — el cliente puede recargar para reintentar.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.orderId, order?.orderStatus]);

  if (notFound) {
    return (
      <div className={styles.notFound}>
        <h1>No encontramos este pedido</h1>
        <p>Puede que el enlace sea incorrecto, o que pertenezca a otra cuenta.</p>
        <Link href="/cuenta/pedidos" className="btn btnPrimary">
          Volver a mis compras
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <>
        <div className={styles.skeleton} aria-busy="true" aria-label="Cargando pedido" />
        <div className={styles.skeleton} aria-hidden="true" />
      </>
    );
  }

  const dateLabel = new Date(order.createdAt).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const readyToReveal = order.orderStatus === "PAID_PENDING_DELIVERY" || order.orderStatus === "COMPLETED";

  return (
    <>
      <Link href="/cuenta/pedidos" className={styles.crumb}>
        <ArrowLeftIcon /> Mis compras
      </Link>

      <div className={styles.head}>
        <h1>Pedido #{order.orderNumber}</h1>
      </div>
      <p className={styles.date}>{dateLabel}</p>

      <div className={styles.statusRow}>
        <StatusPill tone={PAYMENT_TONE[order.orderStatus]} icon={<ShieldCheckIcon />}>
          {PAYMENT_LABEL[order.orderStatus]}
        </StatusPill>
        {(readyToReveal || order.orderStatus === "PAID_AWAITING_REFUND") && (
          <StatusPill tone={readyToReveal ? "good" : "warn"} icon={<PackageCheckIcon />}>
            {readyToReveal ? "Entregado" : "Por entregar"}
          </StatusPill>
        )}
      </div>

      {(order.orderStatus === "FAILED" || order.orderStatus === "PAYMENT_EXPIRED") && (
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

      {order.orderStatus === "PENDING_PAYMENT" && (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>
          <AlertIcon />
          <div>
            <h3>Esperando confirmación del pago</h3>
            <p>Apenas el proveedor de pago nos confirme, tu código va a aparecer acá automáticamente.</p>
          </div>
        </div>
      )}

      {order.orderStatus === "PAID_AWAITING_REFUND" && (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>
          <AlertIcon />
          <div>
            <h3>Tu código no está disponible temporalmente</h3>
            <p>
              Hubo un problema al asignarlo. Ya lo estamos revisando — si en unas horas seguís sin
              verlo, <Link href="/ayuda">contactá a soporte</Link> con el número de este
              pedido.
            </p>
          </div>
        </div>
      )}

      {order.orderStatus === "REFUNDED" && (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>
          <AlertIcon />
          <div>
            <h3>Reembolso procesado</h3>
            <p>El reembolso de este pedido ya fue completado.</p>
          </div>
        </div>
      )}

      <div className={styles.card}>
        {order.items.map((item, i) => {
          const gameId = gameIdFor(item.productId);
          const Mark = gameId ? GAME_MARKS[gameId] : undefined;
          const itemCodes = codes?.[item.productId] ?? [];
          return (
            <div className={styles.item} key={`${item.productId}-${i}`}>
              <div className={styles.imageWrap}>
                {gameId && <GameImageSlot gameId={gameId} label={item.gameLabel} sizeHint="120×120" sizes="56px" />}
              </div>
              <div className={styles.itemBody}>
                <span className={styles.itemGame}>
                  {Mark && <Mark className={styles.mark} />}
                  {item.gameLabel}
                </span>
                <div className={styles.itemDenom}>
                  <b className="num-display">{item.denomination}</b>
                  <span className={styles.itemUnit}>{item.unit}</span>
                </div>
                <div className={`${styles.itemMeta} num-display`}>
                  ×{item.quantity} · {formatCop(item.unitPriceCop)} c/u
                </div>

                {readyToReveal && itemCodes.length > 0 && (
                  <div className={styles.codeList}>
                    {itemCodes.map((code, codeIndex) => (
                      <div key={code}>
                        {itemCodes.length > 1 && (
                          <span className={styles.codeListLabel}>
                            Código {codeIndex + 1} de {itemCodes.length}
                          </span>
                        )}
                        <CodeReveal code={code} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <span className={`${styles.itemPrice} num-display`}>{formatCop(item.lineTotalCop)}</span>
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
            <div className={`${styles.timelineStep} ${order.paymentStatus === "PAID" ? styles.done : ""}`}>
              <span className={styles.timelineDot} />
              <div>
                <div className={styles.timelineLabel}>Pago confirmado</div>
                <div className={styles.timelineNote}>{PAYMENT_LABEL[order.orderStatus]}</div>
              </div>
            </div>
            <div className={`${styles.timelineStep} ${readyToReveal ? styles.done : ""}`}>
              <span className={styles.timelineDot} />
              <div>
                <div className={styles.timelineLabel}>Código entregado</div>
                <div className={styles.timelineNote}>
                  {readyToReveal ? "Disponible en este pedido" : "Todavía no"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

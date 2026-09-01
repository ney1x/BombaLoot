"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "@/app/(storefront)/pedido/[id]/pedido.module.css";
import { CodeReveal } from "./CodeReveal";
import { GameImageSlot } from "./GameImageSlot";
import { InlineBanner } from "./InlineBanner";
import { StatusPill } from "./StatusPill";
import { AlertIcon, ArrowLeftIcon, GAME_MARKS, HeadsetIcon } from "./icons";
import { loadRealCheckoutSession } from "@/lib/payment-session";
import { PRODUCTS, formatCop } from "@/lib/products";
import type { GameId } from "@/lib/products";

type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_EXPIRED"
  | "PAID_PENDING_DELIVERY"
  | "PAID_AWAITING_REFUND"
  | "COMPLETED"
  | "FAILED"
  | "REFUNDED";

interface RealOrderItem {
  productId: string;
  gameLabel: string;
  denomination: string;
  unit: string;
  quantity: number;
  unitPriceCop: number;
  lineTotalCop: number;
}

interface RealOrder {
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
  items: RealOrderItem[];
}

function gameIdFor(productId: string): GameId | undefined {
  return PRODUCTS.find((p) => p.id === productId)?.gameId;
}

export function OrderDeliveryReal({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const [order, setOrder] = useState<RealOrder | null>(null);
  const [notFound, setNotFound] = useState(false);
  // Varios códigos por producto — comprar quantity=4 del mismo producto
  // entrega 4 códigos distintos, no uno solo. Antes esto era
  // Record<string, string>: la API devuelve un objeto por código
  // (mismo productId repetido tantas veces como la cantidad comprada), y
  // guardar uno solo por productId pisaba los anteriores, dejando 3 de 4
  // códigos ya entregados en la base pero nunca mostrados al comprador.
  const [codes, setCodes] = useState<Record<string, string[]> | null>(null);

  const session = typeof window !== "undefined" ? loadRealCheckoutSession() : null;
  // El accessToken de sesión solo vale para EL PEDIDO que lo generó — sin
  // el `session.orderId === id`, visitar /pedido/<otro-id> con una sesión
  // de checkout reciente todavía en sessionStorage ignoraba el id de la
  // URL y mostraba (y entregaba los códigos de) el pedido de la sesión,
  // no el pedido pedido. En una compu compartida eso filtra códigos de
  // un comprador a quien visita el link de otro.
  const accessToken =
    searchParams.get("accessToken") ?? (session?.orderId === id ? session.accessToken : undefined) ?? undefined;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const url = accessToken
          ? `/api/orders/token/${encodeURIComponent(accessToken)}`
          : `/api/orders/${encodeURIComponent(id)}`;
        const response = await fetch(url);
        if (cancelled) return;
        if (!response.ok) {
          setNotFound(true);
          return;
        }
        const body = await response.json();
        setOrder(body.order as RealOrder);
      } catch {
        if (!cancelled) setNotFound(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, accessToken]);

  useEffect(() => {
    if (!order) return;
    if (order.orderStatus !== "PAID_PENDING_DELIVERY" && order.orderStatus !== "COMPLETED") return;
    if (codes) return;

    let cancelled = false;
    (async () => {
      try {
        const qs = accessToken ? `?accessToken=${encodeURIComponent(accessToken)}` : "";
        const response = await fetch(`/api/orders/${order.orderId}/codes${qs}`);
        if (!response.ok || cancelled) return;
        const body = await response.json();
        const map: Record<string, string[]> = {};
        for (const c of body.codes as Array<{ productId: string; code: string }>) {
          (map[c.productId] ??= []).push(c.code);
        }
        if (!cancelled) setCodes(map);
      } catch {
        // Si falla la entrega de códigos, la página igual muestra el resto
        // del pedido — el cliente puede recargar para reintentar.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.orderId, order?.orderStatus]);

  if (notFound) {
    return (
      <main className={styles.main}>
        <div className={styles.notFound}>
          <h1>No encontramos este pedido</h1>
          <p>Puede que el enlace sea incorrecto o que el pedido esté en otro navegador.</p>
          <Link href="/catalogo" className="btn btnPrimary">
            Ir al catálogo
          </Link>
        </div>
      </main>
    );
  }

  if (!order) return null;

  const dateLabel = new Date(order.createdAt).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const paymentTone =
    order.orderStatus === "COMPLETED" || order.orderStatus === "PAID_PENDING_DELIVERY"
      ? "good"
      : order.orderStatus === "FAILED"
        ? "bad"
        : "warn";
  const paymentLabel =
    {
      PENDING_PAYMENT: "Pago pendiente",
      PAYMENT_EXPIRED: "Pago vencido",
      PAID_PENDING_DELIVERY: "Pago confirmado",
      PAID_AWAITING_REFUND: "Pago confirmado",
      COMPLETED: "Pago confirmado",
      FAILED: "Pago rechazado",
      REFUNDED: "Reembolsado",
    }[order.orderStatus] ?? order.paymentStatus;

  const readyToReveal = order.orderStatus === "PAID_PENDING_DELIVERY" || order.orderStatus === "COMPLETED";

  return (
    <main className={styles.main}>
      <Link href="/catalogo" className={styles.crumb}>
        <ArrowLeftIcon /> Seguir comprando
      </Link>

      <div className={styles.head}>
        <h1>{readyToReveal ? "Tu compra está lista" : "Tu pedido está en camino"}</h1>
      </div>
      <p className={styles.sub}>
        Pedido #{order.orderNumber} · {dateLabel}
      </p>

      <div className={styles.statusRow}>
        <StatusPill tone={paymentTone}>{paymentLabel}</StatusPill>
      </div>

      {order.orderStatus === "PENDING_PAYMENT" && (
        <InlineBanner tone="warn" icon={<AlertIcon />} title="Esperando confirmación del pago">
          <p>Apenas el proveedor de pago nos confirme, tu código va a aparecer acá automáticamente.</p>
        </InlineBanner>
      )}

      {(order.orderStatus === "FAILED" || order.orderStatus === "PAYMENT_EXPIRED") && (
        <InlineBanner tone="bad" icon={<AlertIcon />} title="El pago no pudo confirmarse">
          <p>No te cobramos nada por este pedido. Podés intentarlo de nuevo desde el catálogo.</p>
        </InlineBanner>
      )}

      {order.orderStatus === "PAID_AWAITING_REFUND" && (
        <InlineBanner tone="warn" icon={<AlertIcon />} title="Código temporalmente no disponible">
          <p>
            Recibimos tu pago, pero no pudimos entregar el código solicitado. Tu pedido fue
            marcado para reembolso — te avisamos por email cuando esté listo. Si tenés dudas,{" "}
            <Link href="/soporte#contacto">contactá a soporte</Link>.
          </p>
        </InlineBanner>
      )}

      {order.orderStatus === "REFUNDED" && (
        <InlineBanner tone="warn" icon={<AlertIcon />} title="Reembolso procesado">
          <p>El reembolso de este pedido ya fue completado.</p>
        </InlineBanner>
      )}

      <div className={styles.card}>
        {order.items.map((item, i) => {
          const gameId = gameIdFor(item.productId);
          const Mark = gameId ? GAME_MARKS[gameId] : undefined;
          const itemCodes = codes?.[item.productId] ?? [];
          return (
            <div className={styles.item} key={`${item.productId}-${i}`}>
              <div className={styles.imageWrap}>
                {gameId && (
                  <GameImageSlot gameId={gameId} label={item.gameLabel} sizeHint="120×120" sizes="64px" />
                )}
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
                  <>
                    <div className={styles.codeList}>
                      {itemCodes.map((code, codeIndex) => (
                        <div key={code} className={styles.codeListItem}>
                          {itemCodes.length > 1 && (
                            <span className={styles.codeListLabel}>
                              Código {codeIndex + 1} de {itemCodes.length}
                            </span>
                          )}
                          <CodeReveal code={code} />
                        </div>
                      ))}
                    </div>
                    <p className={styles.codeInfo}>
                      {itemCodes.length > 1
                        ? "Cada código es de un solo uso. Guardalos en un lugar seguro — no los compartas."
                        : "Este código es de un solo uso. Guardalo en un lugar seguro — no lo compartas."}
                    </p>
                  </>
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
        <p className={styles.purchaseDate}>
          Comprado el {dateLabel} · confirmación enviada a {order.email}
        </p>
      </div>

      <div className={styles.guestCard}>
        <div className={styles.guestCopy}>
          <h3>¿Querés guardar tus compras?</h3>
          <p>Creá una cuenta para acceder más rápido la próxima vez y ver todo tu historial en un solo lugar.</p>
        </div>
        <Link href="/cuenta/registro" className="btn btnSecondary">
          Crear cuenta
        </Link>
      </div>

      <p className={styles.supportNote}>
        <HeadsetIcon />
        ¿Algo no cuadra con tu pedido? <Link href="/soporte#contacto">Escribinos a soporte</Link>.
      </p>
    </main>
  );
}

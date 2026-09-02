"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "@/app/(storefront)/pedido/[id]/pedido.module.css";
import { CodeReveal } from "./CodeReveal";
import { GameImageSlot } from "./GameImageSlot";
import { InlineBanner } from "./InlineBanner";
import { StatusPill } from "./StatusPill";
import { AlertIcon, ArrowLeftIcon, GAME_MARKS, HeadsetIcon } from "./icons";
import { DELIVERY_STATUS_META, PAYMENT_STATUS_META, getGuestOrder, getOrder, type Order } from "@/lib/orders";
import { formatCop } from "@/lib/products";

export function OrderDeliveryView({ id }: { id: string }) {
  const [ready, setReady] = useState(false);
  const [order, setOrder] = useState<Order | undefined>(undefined);

  useEffect(() => {
    // `getOrder`/`getGuestOrder` leen localStorage — client-only. El
    // efecto difiere la lectura hasta después de la hidratación a
    // propósito: renderizar `null` primero (mismo HTML en servidor y
    // cliente) y recién ahí completar, evita el mismatch de hidratación
    // que un lazy initializer tendría acá.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder(getOrder(id) ?? getGuestOrder(id));
    setReady(true);
  }, [id]);

  if (!ready) return null;

  if (!order) {
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

  const payment = PAYMENT_STATUS_META[order.paymentStatus];
  const delivery = DELIVERY_STATUS_META[order.deliveryStatus];
  const dateLabel = new Date(order.date).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const hasUnavailableCode = order.items.some((i) => i.codeStatus === "unavailable");
  const readyToReveal = order.paymentStatus === "paid";

  return (
    <main className={styles.main}>
      <Link href="/catalogo" className={styles.crumb}>
        <ArrowLeftIcon /> Seguir comprando
      </Link>

      <div className={styles.head}>
        <h1>{readyToReveal ? "Tu compra está lista" : "Tu pedido está en camino"}</h1>
      </div>
      <p className={styles.sub}>Pedido #{order.id} · {dateLabel}</p>

      <div className={styles.statusRow}>
        <StatusPill tone={payment.tone}>{payment.label}</StatusPill>
        {order.paymentStatus === "paid" && (
          <StatusPill tone={delivery.tone}>{delivery.label}</StatusPill>
        )}
      </div>

      {order.paymentStatus === "pending" && (
        <InlineBanner tone="warn" icon={<AlertIcon />} title="Esperando confirmación del pago">
          <p>Apenas el proveedor de pago nos confirme, tu código va a aparecer acá automáticamente.</p>
        </InlineBanner>
      )}

      {order.paymentStatus === "failed" && (
        <InlineBanner tone="bad" icon={<AlertIcon />} title="El pago no pudo confirmarse">
          <p>No te cobramos nada por este pedido. Podés intentarlo de nuevo desde el catálogo.</p>
        </InlineBanner>
      )}

      {hasUnavailableCode && (
        <InlineBanner tone="warn" icon={<AlertIcon />} title="Código temporalmente no disponible">
          <p>
            Hubo un problema al asignar tu código. Ya lo estamos revisando — si en unas horas
            seguís sin verlo, <Link href="/ayuda">contactá a soporte</Link> con el
            número de este pedido.
          </p>
        </InlineBanner>
      )}

      <div className={styles.card}>
        {order.items.map((item, i) => {
          const Mark = GAME_MARKS[item.gameId];
          return (
            <div className={styles.item} key={`${item.productId}-${i}`}>
              <div className={styles.imageWrap}>
                <GameImageSlot gameId={item.gameId} label={item.gameLabel} sizeHint="120×120" sizes="64px" />
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

                {readyToReveal && item.codeStatus === "available" && item.code && (
                  <>
                    <CodeReveal code={item.code} />
                    <p className={styles.codeInfo}>
                      Este código es de un solo uso. Guardalo en un lugar seguro — no lo compartas.
                    </p>
                  </>
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
        <p className={styles.purchaseDate}>Comprado el {dateLabel} · confirmación enviada a {order.email}</p>
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
        ¿Algo no cuadra con tu pedido? <Link href="/ayuda">Escribinos a soporte</Link>.
      </p>
    </main>
  );
}

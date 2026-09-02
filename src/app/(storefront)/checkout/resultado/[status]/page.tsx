"use client";

import Link from "next/link";
import { notFound, useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import styles from "./resultado.module.css";
import { AlertIcon, CardOffIcon, CheckIcon } from "@/components/icons";
import { PaymentStatusLayout } from "@/components/PaymentStatusLayout";
import { PaymentResultReal } from "@/components/PaymentResultReal";
import { PAYMENT_METHODS, loadPendingCheckout, type PendingCheckout } from "@/lib/checkout";
import { getGuestOrder, getOrder, orderItemsSummary, type Order } from "@/lib/orders";
import { formatCop } from "@/lib/products";

const VALID_STATUSES = ["exito", "rechazado", "error"] as const;
type Status = (typeof VALID_STATUSES)[number];

/**
 * Esta ruta atiende dos cosas con el mismo segmento `[status]`, a
 * propósito — no crear una ruta paralela para no romper los links del
 * flujo mock ya existentes (`/checkout/resultado/exito`, etc):
 *  - un `status` mock (`exito`/`rechazado`/`error`), del flujo de diseño
 *    original, o
 *  - un `paymentIntentId` real (UUID), que es lo que Wompi/PayPal
 *    reciben como `redirect_url`/`return_url` (ver `payment-intent-service.ts`).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ResultadoPage() {
  return (
    <Suspense fallback={null}>
      <ResultadoContent />
    </Suspense>
  );
}

function ResultadoContent() {
  const params = useParams<{ status: string }>();
  const raw = params.status;

  if (UUID_RE.test(raw)) return <PaymentResultReal paymentIntentId={raw} />;

  const status = raw as Status;
  if (!VALID_STATUSES.includes(status)) notFound();

  if (status === "exito") return <ExitoResult />;
  if (status === "rechazado") return <RechazadoResult />;
  return <ErrorResult />;
}

function useLastOrder(orderId: string | null): { ready: boolean; order: Order | undefined } {
  const [ready, setReady] = useState(false);
  const [order, setOrder] = useState<Order | undefined>(undefined);

  useEffect(() => {
    // Lectura de localStorage client-only, diferida tras la hidratación —
    // mismo motivo que en `OrderDeliveryView`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder(orderId ? getGuestOrder(orderId) ?? getOrder(orderId) : undefined);
    setReady(true);
  }, [orderId]);

  return { ready, order };
}

function usePendingCheckout(): { ready: boolean; checkout: PendingCheckout | null } {
  const [ready, setReady] = useState(false);
  const [checkout, setCheckout] = useState<PendingCheckout | null>(null);

  useEffect(() => {
    // Lectura de sessionStorage client-only, diferida tras la hidratación
    // — mismo motivo que en `OrderDeliveryView`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCheckout(loadPendingCheckout());
    setReady(true);
  }, []);

  return { ready, checkout };
}

function ExitoResult() {
  const searchParams = useSearchParams();
  const { ready, order } = useLastOrder(searchParams.get("order"));

  if (!ready) return null;

  return (
    <PaymentStatusLayout
      tone="good"
      icon={<CheckIcon />}
      title="¡Pago confirmado!"
      subtitle={
        order
          ? `Tu pedido #${order.id} quedó registrado y tu código ya está disponible.`
          : "Tu pedido quedó registrado y tu código ya está disponible."
      }
    >
      {order ? (
        <>
          <div className={styles.details}>
            <div className={styles.detailRow}>
              <span>Pedido</span>
              <span>#{order.id}</span>
            </div>
            <div className={styles.detailRow}>
              <span>Total</span>
              <span className="num-display">{formatCop(order.totalCop)}</span>
            </div>
            <div className={styles.detailRow}>
              <span>Email</span>
              <span>{order.email}</span>
            </div>
            <div className={styles.detailDivider} />
            <p className={styles.items}>{orderItemsSummary(order)}</p>
          </div>

          <div className={styles.ctaRow}>
            <Link href={`/pedido/${order.id}`} className="btn btnPrimary">
              Ver mi pedido
            </Link>
            <Link href="/catalogo" className="btn btnSecondary">
              Seguir comprando
            </Link>
          </div>
        </>
      ) : (
        <div className={styles.ctaRow}>
          <Link href="/catalogo" className="btn btnPrimary">
            Seguir comprando
          </Link>
        </div>
      )}
    </PaymentStatusLayout>
  );
}

function RechazadoResult() {
  const { ready, checkout } = usePendingCheckout();

  if (!ready) return null;

  const method = checkout ? PAYMENT_METHODS.find((m) => m.id === checkout.method) : undefined;

  return (
    <PaymentStatusLayout
      tone="bad"
      icon={<CardOffIcon />}
      title="No pudimos confirmar tu pago"
      subtitle="El proveedor de pago rechazó la transacción. No te cobramos nada por este intento."
    >
      {checkout && (
        <div className={styles.details}>
          <div className={styles.detailRow}>
            <span>Ibas a pagar</span>
            <span className="num-display">{formatCop(checkout.totalCop)}</span>
          </div>
          <div className={styles.detailRow}>
            <span>Método</span>
            <span>{method?.name ?? checkout.method}</span>
          </div>
        </div>
      )}

      <ul className={styles.causes}>
        <li>Fondos insuficientes o límite alcanzado</li>
        <li>Datos de la tarjeta incorrectos</li>
        <li>El proveedor bloqueó la operación por seguridad</li>
      </ul>

      <div className={styles.ctaRow}>
        <Link href="/checkout" className="btn btnPrimary">
          Intentar de nuevo
        </Link>
        <Link href="/carrito" className="btn btnSecondary">
          Revisar mi carrito
        </Link>
      </div>
    </PaymentStatusLayout>
  );
}

function ErrorResult() {
  const { ready, checkout } = usePendingCheckout();

  if (!ready) return null;

  return (
    <PaymentStatusLayout
      tone="warn"
      icon={<AlertIcon />}
      title="Algo salió mal"
      subtitle="Tuvimos un problema inesperado al procesar tu pago. No es necesario que hagas nada más por ahora — podés intentarlo de nuevo o escribirnos."
    >
      {checkout && <p className={styles.reference}>Referencia: {checkout.id}</p>}

      <div className={styles.ctaRow}>
        <Link href="/checkout" className="btn btnPrimary">
          Reintentar
        </Link>
        <Link href="/ayuda" className="btn btnSecondary">
          Contactar soporte
        </Link>
      </div>
    </PaymentStatusLayout>
  );
}

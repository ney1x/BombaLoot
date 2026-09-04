"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "@/app/(storefront)/checkout/resultado/[status]/resultado.module.css";
import { AlertIcon, CardOffIcon, CheckIcon, HourglassIcon } from "./icons";
import { NequiPendingStatus } from "./NequiPendingStatus";
import { PaymentStatusLayout } from "./PaymentStatusLayout";
import { loadRealCheckoutSession } from "@/lib/payment-session";
import { formatCop } from "@/lib/products";

type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_EXPIRED"
  | "PAID_PENDING_DELIVERY"
  | "PAID_AWAITING_REFUND"
  | "COMPLETED"
  | "FAILED"
  | "REFUNDED";

interface ResultOrder {
  orderId: string;
  orderNumber: string;
  email: string;
  totalCop: number;
  orderStatus: OrderStatus;
}

interface ResultResponse {
  paymentIntentId: string;
  provider: "WOMPI" | "PAYPAL";
  paymentIntentStatus: string;
  order: ResultOrder;
}

const POLL_MS = 3000;
const MAX_POLLS = 20; // ~1 minuto

/**
 * Nunca confía en el redirect del navegador: siempre lee el estado real vía
 * `GET /api/result/[paymentIntentId]`, que a su vez sincroniza contra el
 * proveedor del lado del servidor si el webhook parece perdido (ver
 * `result-service.ts`). Mientras el pago sigue en curso, hace polling corto
 * — no hay otra señal confiable de "ya está" del lado del cliente.
 */
export function PaymentResultReal({ paymentIntentId }: { paymentIntentId: string }) {
  const searchParams = useSearchParams();
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const capturedRef = useRef(false);
  const pollCountRef = useRef(0);

  const session = typeof window !== "undefined" ? loadRealCheckoutSession() : null;
  const paypalToken = searchParams.get("token"); // PayPal reenvía `?token=<paypalOrderId>` en el return_url
  const [retryTick, setRetryTick] = useState(0);

  /*
   * Ya no lleva el token (auditoría de seguridad, 2026-09-04): la cookie
   * httpOnly plantada al crear el pedido (`loadout_order_<id>`, ver
   * `server/auth/cookies.ts`) sobrevive cerrar la pestaña — a diferencia de
   * `sessionStorage`, que es justo lo que motivaba llevar el token acá antes.
   * Si la cookie no llegó a plantarse por algún motivo, `/pedido/[id]` sigue
   * teniendo su propio camino de recuperación en frío (pedir el email de la
   * compra) para quien llegue con un link viejo que sí lo tenía.
   */
  function orderHref(orderId: string): string {
    return `/pedido/${orderId}`;
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    pollCountRef.current = 0;

    async function captureIfNeeded() {
      if (capturedRef.current || !paypalToken) return;
      capturedRef.current = true;
      try {
        await fetch("/api/payments/paypal/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId }),
        });
      } catch {
        // Si la captura falla acá, el poll de abajo igual va a reflejar el
        // estado real (o el webhook lo resuelve) — no es fatal para la UI.
      }
    }

    async function poll() {
      await captureIfNeeded();
      try {
        const response = await fetch(`/api/result/${paymentIntentId}`);
        const body = await response.json();
        if (cancelled) return;

        if (!response.ok) {
          setError(body.error ?? "No pudimos consultar el estado de tu pago.");
          return;
        }

        setError(null);
        setResult(body as ResultResponse);

        const stillGoing = body.paymentIntentStatus === "PENDING" || body.paymentIntentStatus === "INITIATED";
        pollCountRef.current += 1;
        if (stillGoing && pollCountRef.current < MAX_POLLS) {
          timer = setTimeout(poll, POLL_MS);
        }
      } catch {
        if (!cancelled) setError("No pudimos consultar el estado de tu pago.");
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentIntentId, retryTick]);

  if (error) {
    // El pago ya puede estar confirmado del lado del servidor aunque esta
    // consulta haya fallado (red, timeout) — nunca mandar a `/checkout`
    // acá: eso arranca un pedido nuevo y pierde la referencia al que ya se
    // pagó. Reintenta la misma consulta y, si conocemos el pedido por
    // `sessionStorage` (mismo origen del checkout), ofrece ir directo a él.
    return (
      <PaymentStatusLayout tone="warn" icon={<AlertIcon />} title="Algo salió mal">
        <p>{error}</p>
        {session && <p className={styles.reference}>Pedido #{session.orderNumber}</p>}
        <div className={styles.ctaRow}>
          <button type="button" className="btn btnPrimary" onClick={() => setRetryTick((t) => t + 1)}>
            Reintentar
          </button>
          {session && (
            <Link href={orderHref(session.orderId)} className="btn btnSecondary">
              Ver mi pedido
            </Link>
          )}
          <Link href="/ayuda" className="btn btnSecondary">
            Contactar soporte
          </Link>
        </div>
      </PaymentStatusLayout>
    );
  }

  if (!result) {
    // Antes del primer poll todavía no hay `result`, pero el método ya se
    // conoce por la sesión de checkout — Nequi entra directo a su propia
    // pantalla en vez de pasar primero por el "Confirmando tu pago"
    // genérico y recién después cambiar a la de Nequi.
    if (session?.methodId === "nequi") {
      return <NequiPendingStatus />;
    }
    return (
      <PaymentStatusLayout tone="neutral" pulse icon={<HourglassIcon />} title="Confirmando tu pago">
        No cierres ni recargues esta ventana.
      </PaymentStatusLayout>
    );
  }

  const { order } = result;

  if (order.orderStatus === "COMPLETED" || order.orderStatus === "PAID_PENDING_DELIVERY") {
    return (
      <PaymentStatusLayout
        tone="good"
        icon={<CheckIcon />}
        title="¡Pago confirmado!"
        subtitle={`Tu pedido #${order.orderNumber} quedó registrado y tu código ya está disponible.`}
      >
        <div className={styles.details}>
          <div className={styles.detailRow}>
            <span>Pedido</span>
            <span>#{order.orderNumber}</span>
          </div>
          <div className={styles.detailRow}>
            <span>Total</span>
            <span className="num-display">{formatCop(order.totalCop)}</span>
          </div>
          <div className={styles.detailRow}>
            <span>Email</span>
            <span>{order.email}</span>
          </div>
        </div>
        <div className={styles.ctaRow}>
          <Link href={orderHref(order.orderId)} className="btn btnPrimary">
            Ver mi pedido
          </Link>
          <Link href="/catalogo" className="btn btnSecondary">
            Seguir comprando
          </Link>
        </div>
      </PaymentStatusLayout>
    );
  }

  if (order.orderStatus === "PAID_AWAITING_REFUND") {
    return (
      <PaymentStatusLayout
        tone="warn"
        icon={<AlertIcon />}
        title="Recibimos tu pago"
        subtitle="No pudimos entregar el código solicitado debido a un problema de disponibilidad. Tu pedido fue marcado para reembolso — te avisamos por email cuando esté listo."
      >
        <div className={styles.details}>
          <div className={styles.detailRow}>
            <span>Pedido</span>
            <span>#{order.orderNumber}</span>
          </div>
          <div className={styles.detailRow}>
            <span>Total</span>
            <span className="num-display">{formatCop(order.totalCop)}</span>
          </div>
        </div>
        <div className={styles.ctaRow}>
          <Link href="/ayuda" className="btn btnSecondary">
            Contactar soporte
          </Link>
        </div>
      </PaymentStatusLayout>
    );
  }

  if (order.orderStatus === "REFUNDED") {
    return (
      <PaymentStatusLayout
        tone="neutral"
        icon={<CheckIcon />}
        title="Reembolso procesado"
        subtitle={`El reembolso de tu pedido #${order.orderNumber} ya fue completado.`}
      />
    );
  }

  if (order.orderStatus === "FAILED") {
    return (
      <PaymentStatusLayout
        tone="bad"
        icon={<CardOffIcon />}
        title="No pudimos confirmar tu pago"
        subtitle="El proveedor de pago rechazó la transacción. No te cobramos nada por este intento."
      >
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

  // PENDING_PAYMENT / PAYMENT_EXPIRED mientras el webhook todavía no llega.
  if (session?.methodId === "nequi") {
    return <NequiPendingStatus />;
  }

  return (
    <PaymentStatusLayout tone="neutral" pulse icon={<HourglassIcon />} title="Confirmando tu pago">
      No cierres ni recargues esta ventana — puede tardar unos segundos.
    </PaymentStatusLayout>
  );
}

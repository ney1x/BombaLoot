"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./pago.module.css";
import { AlertIcon } from "@/components/icons";
import { PaymentStatusLayout } from "@/components/PaymentStatusLayout";
import { Spinner } from "@/components/Spinner";
import { PAYMENT_METHODS } from "@/lib/checkout";
import { loadRealCheckoutSession, type RealCheckoutSession } from "@/lib/payment-session";

/**
 * Sin tarjeta ni borde a propósito — es un tránsito, no un mensaje que
 * necesite el peso visual de una card. A `100dvh` para que el `Footer` del
 * layout (sigue montado justo debajo) quede fuera de vista mientras dura
 * el redirect, mismo criterio que `(storefront)/loading.tsx`.
 */
function RedirectingToPayment({ subtitle }: { subtitle?: React.ReactNode }) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <Spinner size={36} />
      <p className={styles.title}>Redireccionando a pago seguro!</p>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  );
}

/**
 * Inicia el pago real: llama `POST /api/payments/[provider]/init` (que NO
 * confía en nada del navegador salvo `orderId`/`accessToken`, ya creados
 * por `/checkout`) y redirige al checkout alojado del proveedor. El
 * navegador nunca marca nada como pagado acá — solo pide la URL y viaja.
 */
export default function PagoPendientePage() {
  const router = useRouter();
  const [session, setSession] = useState<RealCheckoutSession | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // `loadRealCheckoutSession` lee sessionStorage — client-only, difiere
    // la lectura hasta después de la hidratación (mismo motivo que en
    // `OrderDeliveryView`).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(loadRealCheckoutSession());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/checkout");
      return;
    }
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const response = await fetch(`/api/payments/${session.provider}/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: session.orderId, accessToken: session.accessToken ?? undefined }),
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? "No pudimos iniciar el pago. Intentá de nuevo.");
        }
        const redirectUrl = body.checkoutUrl ?? body.approvalUrl;
        if (!redirectUrl) throw new Error("El proveedor no devolvió una URL de pago.");
        window.location.href = redirectUrl;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No pudimos iniciar el pago. Intentá de nuevo.");
      }
    })();
  }, [ready, session, router]);

  if (!ready || !session) {
    return <RedirectingToPayment />;
  }

  const method = PAYMENT_METHODS.find((m) => m.id === session.provider);

  if (error) {
    return (
      <PaymentStatusLayout
        tone="bad"
        icon={<AlertIcon />}
        title="No pudimos iniciar el pago"
        subtitle={error}
      >
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <a href="/checkout" className="btn btnPrimary">
            Volver al checkout
          </a>
          <a href="/ayuda" className="btn btnSecondary">
            Contactar soporte
          </a>
        </div>
      </PaymentStatusLayout>
    );
  }

  return (
    <RedirectingToPayment
      subtitle={
        <>
          Te llevamos a {method?.name ?? "tu método de pago"} para completar la transacción. Tu
          pedido todavía no queda como completado hasta que se confirme — no cierres ni recargues
          esta ventana.
        </>
      }
    />
  );
}

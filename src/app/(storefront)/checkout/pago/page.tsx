"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertIcon, HourglassIcon } from "@/components/icons";
import { PaymentStatusLayout } from "@/components/PaymentStatusLayout";
import { PAYMENT_METHODS } from "@/lib/checkout";
import { loadRealCheckoutSession, type RealCheckoutSession } from "@/lib/payment-session";

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

  if (!ready || !session) return null;

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
          <a href="/soporte#contacto" className="btn btnSecondary">
            Contactar soporte
          </a>
        </div>
      </PaymentStatusLayout>
    );
  }

  return (
    <PaymentStatusLayout
      tone="neutral"
      pulse
      icon={<HourglassIcon />}
      title="Te estamos redirigiendo"
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

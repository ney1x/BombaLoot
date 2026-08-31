"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/(storefront)/checkout/checkout.module.css";
import { BuyerInfoForm } from "./BuyerInfoForm";
import { CheckoutSummary, type CheckoutLine } from "./CheckoutSummary";
import { EmptyState } from "./EmptyState";
import { InlineBanner } from "./InlineBanner";
import { PaymentMethodPicker } from "./PaymentMethodPicker";
import { ReservationTimer } from "./ReservationTimer";
import {
  AlertIcon,
  CartEmptyIcon,
  HeadsetIcon,
  HourglassIcon,
  LockIcon,
  MailIcon,
  PackageCheckIcon,
} from "./icons";
import { PAYMENT_METHODS, RESERVATION_SECONDS, type BuyerInfo, type PaymentMethodId } from "@/lib/checkout";
import { saveRealCheckoutSession } from "@/lib/payment-session";
import { useCart } from "@/lib/cart-context";
import { useCatalog } from "@/lib/use-catalog";
import { useSession } from "@/lib/session-context";
import { formatCop } from "@/lib/products";
import { tierForPurchases } from "@/lib/user";

export function CheckoutView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lines } = useCart();
  const products = useCatalog();
  const { user: sessionUser } = useSession();

  // Demo-only override so every visual state is reachable for design review
  // (/checkout?demo=agotado|insuficiente|expirada). Real stock and
  // reservation checks replace this once the backend lands.
  const demo = searchParams.get("demo");

  const [buyer, setBuyer] = useState<BuyerInfo>({ name: "", email: "", isGuest: true });
  const [method, setMethod] = useState<PaymentMethodId>("wompi");
  const [reservationExpired, setReservationExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Un UUID por intento de checkout (no por render): mismo criterio que el
  // backend espera para idempotencia — un reintento (doble clic, timeout)
  // reenvía el MISMO id; un intento nuevo (el usuario vuelve más tarde)
  // necesita remontar el componente para generar otro.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (sessionUser) {
      setBuyer((prev) => (prev.isGuest && !prev.email ? { name: sessionUser.name ?? "", email: sessionUser.email, isGuest: false } : prev));
    }
  }, [sessionUser]);

  const resolved = useMemo(
    () =>
      lines
        // Líneas en 0 quedan visibles en el carrito, pero no se compran.
        .filter((line) => line.quantity > 0)
        .map((line) => ({ line, product: products?.find((p) => p.id === line.productId) }))
        .filter((entry): entry is { line: typeof entry.line; product: NonNullable<typeof entry.product> } =>
          Boolean(entry.product),
        ),
    [lines, products],
  );

  const checkoutLines: CheckoutLine[] = useMemo(
    () =>
      resolved.map(({ line, product }, index) => {
        let flag: CheckoutLine["flag"];
        if (product.stock === "out") flag = "agotado";
        else if (product.stock === "low" && line.quantity > (product.lowStockCount ?? 1)) flag = "insuficiente";
        if (index === 0 && demo === "agotado") flag = "agotado";
        if (index === 0 && demo === "insuficiente") flag = "insuficiente";
        return { product, quantity: line.quantity, flag };
      }),
    [resolved, demo],
  );

  const tier = tierForPurchases(sessionUser?.purchasesCount ?? 0);
  const discountPct = buyer.isGuest ? 0 : tier.discountPct;
  const discountLabel = buyer.isGuest ? undefined : `${tier.name} · ${tier.discountPct}%`;

  const subtotalCop = checkoutLines.reduce((sum, l) => sum + l.product.priceCop * l.quantity, 0);
  const discountCop = Math.round(subtotalCop * (discountPct / 100));
  const totalCop = subtotalCop - discountCop;

  const hasStockIssue = checkoutLines.some((l) => l.flag);
  const expired = reservationExpired || demo === "expirada";
  const emailValid = /^\S+@\S+\.\S+$/.test(buyer.email.trim());
  const canSubmit = checkoutLines.length > 0 && !hasStockIssue && !expired && emailValid;
  const selectedMethod = PAYMENT_METHODS.find((m) => m.id === method)!;

  if (products === null) {
    return null;
  }

  if (resolved.length === 0) {
    return (
      <EmptyState
        icon={CartEmptyIcon}
        title="Tu carrito está vacío"
        body="Agregá al menos un producto desde el catálogo para continuar con el pago."
        actionHref="/catalogo"
        actionLabel="Explorar catálogo"
      />
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: checkoutLines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
          idempotencyKey: idempotencyKeyRef.current,
          buyerEmail: buyer.email.trim(),
          buyerName: buyer.name.trim() || undefined,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "No pudimos crear tu pedido. Intentá de nuevo.");
      }

      const order = body.order as {
        orderId: string;
        orderNumber: string;
        accessToken: string | null;
        email: string;
        totalCop: number;
        paymentExpiresAt: string;
      };

      saveRealCheckoutSession({
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        accessToken: order.accessToken,
        email: order.email,
        totalCop: order.totalCop,
        paymentExpiresAt: order.paymentExpiresAt,
        provider: method,
      });

      router.push("/checkout/pago");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "No pudimos crear tu pedido. Intentá de nuevo.");
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.grid} onSubmit={handleSubmit}>
      <div className={styles.main}>
        {!expired && checkoutLines.length > 0 && (
          <div className={styles.timerRow}>
            <ReservationTimer
              durationSeconds={RESERVATION_SECONDS}
              forceExpired={demo === "expirada"}
              onExpire={() => setReservationExpired(true)}
            />
          </div>
        )}

        {submitError && (
          <InlineBanner tone="bad" icon={<AlertIcon />} title="No pudimos continuar">
            <p>{submitError}</p>
          </InlineBanner>
        )}

        {hasStockIssue && (
          <InlineBanner tone="bad" icon={<AlertIcon />} title="Uno o más productos cambiaron de disponibilidad">
            <p>
              Ajustá tu pedido antes de continuar — no te vamos a cobrar nada hasta que esté
              resuelto. <Link href="/carrito">Ir al carrito →</Link>
            </p>
          </InlineBanner>
        )}

        <CheckoutSummary
          lines={checkoutLines}
          subtotalCop={subtotalCop}
          discountCop={discountCop}
          discountLabel={discountLabel}
          totalCop={totalCop}
        />

        {expired ? (
          <div className={styles.expiredCard}>
            <span className={styles.expiredIcon}>
              <HourglassIcon />
            </span>
            <h2>Tu reserva expiró</h2>
            <p>
              Los códigos de tu pedido volvieron a estar disponibles para otros compradores.
              Volvé al carrito para reservarlos de nuevo — no te cobramos nada por este intento.
            </p>
            <Link href="/carrito" className="btn btnPrimary">
              Volver al carrito
            </Link>
          </div>
        ) : (
          <>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Información del comprador</h2>
              <BuyerInfoForm value={buyer} onChange={setBuyer} sessionUser={sessionUser} />
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Método de pago</h2>
              <PaymentMethodPicker selected={method} onSelect={setMethod} />
            </section>
          </>
        )}
      </div>

      {!expired && (
        <aside className={styles.aside}>
          <h2 className={styles.asideTitle}>Confirmación</h2>

          <div className={styles.asideRow}>
            <span>Método de pago</span>
            <span className={styles.asideValue}>{selectedMethod.name}</span>
          </div>
          <div className={styles.asideRow}>
            <span>Confirmación a</span>
            <span className={styles.asideValue}>{buyer.email.trim() || "—"}</span>
          </div>

          <div className={styles.asideDivider} />

          <div className={styles.asideRow}>
            <span>Subtotal</span>
            <span className="num-display">{formatCop(subtotalCop)}</span>
          </div>
          <div className={`${styles.asideRow} ${discountCop > 0 ? styles.discount : ""}`}>
            <span>Descuento</span>
            <span className="num-display">
              {discountCop > 0 ? `−${formatCop(discountCop)}` : formatCop(0)}
            </span>
          </div>
          <div className={styles.asideTotalRow}>
            <span className={styles.asideTotalLabel}>Total</span>
            <span className={`${styles.asideTotalValue} num-display`}>{formatCop(totalCop)}</span>
          </div>

          <button type="submit" className="btn btnPrimary" disabled={!canSubmit || submitting}>
            {submitting ? "Redirigiendo…" : "Continuar al pago"}
          </button>
          <p className={styles.terms}>
            Al continuar aceptás nuestras{" "}
            <Link href="/soporte#reembolsos">condiciones de compra y reembolsos</Link>.
          </p>

          <div className={styles.trustList}>
            <div className={styles.trustItem}>
              <LockIcon />
              <span>Pago seguro</span>
            </div>
            <div className={styles.trustItem}>
              <PackageCheckIcon />
              <span>Entrega digital</span>
            </div>
            <div className={styles.trustItem}>
              <MailIcon />
              <span>Confirmación por email</span>
            </div>
            <div className={styles.trustItem}>
              <HeadsetIcon />
              <span>Soporte si algo falla</span>
            </div>
          </div>
        </aside>
      )}

      {!expired && (
        <div className={styles.mobileBar}>
          <div className={styles.mobileBarTotal}>
            <span className={styles.mobileBarLabel}>Total</span>
            <span className={`${styles.mobileBarValue} num-display`}>{formatCop(totalCop)}</span>
          </div>
          <button type="submit" className="btn btnPrimary" disabled={!canSubmit || submitting}>
            {submitting ? "Redirigiendo…" : "Continuar al pago"}
          </button>
        </div>
      )}
    </form>
  );
}

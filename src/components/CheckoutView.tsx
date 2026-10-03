"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/(storefront)/checkout/checkout.module.css";
import nequiStyles from "./NequiPhoneField.module.css";
import { BuyerInfoForm } from "./BuyerInfoForm";
import { CheckoutSummary, type CheckoutLine } from "./CheckoutSummary";
import { DiscountCodeField, type AppliedDiscount } from "./DiscountCodeField";
import { EmailConfirmModal } from "./EmailConfirmModal";
import { EmptyState } from "./EmptyState";
import { InlineBanner } from "./InlineBanner";
import { LoyaltyCouponPicker, type AppliedLoyaltyCoupon } from "./LoyaltyCouponPicker";
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
  const [method, setMethod] = useState<PaymentMethodId>("nequi");
  const [nequiPhone, setNequiPhone] = useState("");
  const [nequiLastName, setNequiLastName] = useState("");
  const [nequiLegalId, setNequiLegalId] = useState("");
  const [nequiConsent, setNequiConsent] = useState(false);
  const [discount, setDiscount] = useState<AppliedDiscount | null>(null);
  const [loyaltyCoupon, setLoyaltyCoupon] = useState<AppliedLoyaltyCoupon | null>(null);
  const [reservationExpired, setReservationExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmingEmail, setConfirmingEmail] = useState(false);
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

  const subtotalCop = checkoutLines.reduce((sum, l) => sum + l.product.priceCop * l.quantity, 0);

  // Ya no hay descuento automático de fondo por nivel — el comprador elige
  // como mucho uno: un código de descuento escrito, o un cupón de
  // fidelización de su cuenta (mutuamente excluyentes, ver más abajo). El
  // backend vuelve a calcular esto igual al confirmar — esto es solo la
  // vista previa antes de enviar el pedido.
  const discountCop = discount?.amountCop ?? loyaltyCoupon?.amountCop ?? 0;
  const discountLabel = discount?.code ?? loyaltyCoupon?.label;
  const totalCop = subtotalCop - discountCop;

  const hasStockIssue = checkoutLines.some((l) => l.flag);
  const expired = reservationExpired || demo === "expirada";
  const emailValid = /^\S+@\S+\.\S+$/.test(buyer.email.trim());
  // Nequi es el único método que arma la transacción acá mismo (sin ir al
  // checkout alojado de Wompi) — necesita el celular antes de poder seguir.
  // La cédula NO la pide Wompi (ya lo probamos: el sandbox aprueba solo con
  // celular + email) — es una decisión propia, con su propio checkbox de
  // consentimiento, para identificación del comprador / antifraude.
  const nequiPhoneDigits = nequiPhone.replace(/\D/g, "");
  const nequiPhoneValid = /^3\d{9}$/.test(nequiPhoneDigits);
  const nequiLegalIdValid = /^\d{10}$/.test(nequiLegalId);
  // Nombre/apellido son obligatorios acá (a diferencia de BuyerInfoForm,
  // donde el nombre es opcional) — mismo criterio que Bonoxs, que los pide
  // con asterisco junto al resto de datos de identificación.
  const nequiNameValid = buyer.name.trim().length > 0 && nequiLastName.trim().length > 0;
  const canSubmit =
    checkoutLines.length > 0 &&
    !hasStockIssue &&
    !expired &&
    emailValid &&
    (method !== "nequi" || (nequiPhoneValid && nequiLegalIdValid && nequiNameValid && nequiConsent));
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

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    // Confirmar el email de vuelta es más importante para quien lo tipeó
    // ahora mismo (invitado) que para quien ya lo tiene guardado en su
    // cuenta — a ese no le hace falta el paso extra.
    if (buyer.isGuest) {
      setConfirmingEmail(true);
      return;
    }
    void submitOrder();
  }

  async function submitOrder() {
    setConfirmingEmail(false);
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
          buyerName:
            method === "nequi"
              ? [buyer.name.trim(), nequiLastName.trim()].filter(Boolean).join(" ") || undefined
              : buyer.name.trim() || undefined,
          discountCode: discount?.code,
          loyaltyCouponId: loyaltyCoupon?.id,
          buyerLegalId: method === "nequi" ? nequiLegalId.trim() : undefined,
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
        email: order.email,
        totalCop: order.totalCop,
        paymentExpiresAt: order.paymentExpiresAt,
        // A quién se le pega de verdad — PSE/Tarjeta comparten el checkout
        // alojado de Wompi (ver PAYMENT_METHODS en lib/checkout.ts); Nequi
        // sigue siendo Wompi como API, pero arma la transacción acá mismo
        // (ver la rama de abajo), nunca redirige.
        provider: selectedMethod.provider,
        methodId: method,
      });

      if (method === "nequi") {
        // Sin redirect: la transacción se crea acá mismo y el cliente
        // aprueba un push en su app Nequi. De acá en más es la MISMA
        // pantalla de resultado que usan Wompi (widget) y PayPal después
        // de volver — solo cambia cómo se llegó al `paymentIntentId`.
        const nequiResponse = await fetch("/api/payments/wompi/nequi/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.orderId,
            accessToken: order.accessToken ?? undefined,
            phoneNumber: nequiPhoneDigits,
          }),
        });
        const nequiBody = await nequiResponse.json();
        if (!nequiResponse.ok) {
          throw new Error(nequiBody.error ?? "No pudimos iniciar el pago con Nequi. Intentá de nuevo.");
        }
        router.push(`/checkout/resultado/${nequiBody.paymentIntentId}`);
        return;
      }

      router.push("/checkout/pago");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "No pudimos crear tu pedido. Intentá de nuevo.");
      setSubmitting(false);
    }
  }

  return (
    <>
    {confirmingEmail && (
      <EmailConfirmModal
        email={buyer.email.trim()}
        onConfirm={() => void submitOrder()}
        onEdit={() => setConfirmingEmail(false)}
      />
    )}
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

        {!expired && checkoutLines.length > 0 && (
          <section className={styles.section}>
            {!loyaltyCoupon && (
              <DiscountCodeField
                lines={checkoutLines.map(({ product, quantity }) => ({ productId: product.id, quantity }))}
                buyerEmail={buyer.email.trim()}
                applied={discount}
                onApplied={setDiscount}
              />
            )}
            {/* Sin cuenta no hay cupón que ofrecer — el picker se esconde solo (ver LoyaltyCouponPicker). */}
            {!buyer.isGuest && !discount && (
              <div style={{ marginTop: 10 }}>
                <LoyaltyCouponPicker subtotalCop={subtotalCop} applied={loyaltyCoupon} onApplied={setLoyaltyCoupon} />
              </div>
            )}
          </section>
        )}

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
            {method !== "nequi" && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Información del comprador</h2>
                <BuyerInfoForm value={buyer} onChange={setBuyer} sessionUser={sessionUser} />
              </section>
            )}

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Método de pago</h2>
              <PaymentMethodPicker
                selected={method}
                onSelect={setMethod}
                renderExpansion={(id) =>
                  id === "nequi" ? (
                    <div className={nequiStyles.wrap}>
                      <p className={nequiStyles.blockTitle}>Necesitamos información adicional</p>

                      <div className={nequiStyles.fieldGrid}>
                        <div className={nequiStyles.field}>
                          <label className={nequiStyles.label} htmlFor="nequi-name">
                            Nombre
                          </label>
                          <input
                            id="nequi-name"
                            type="text"
                            autoComplete="given-name"
                            placeholder="Tu nombre"
                            className={nequiStyles.input}
                            value={buyer.name}
                            onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
                          />
                        </div>
                        <div className={nequiStyles.field}>
                          <label className={nequiStyles.label} htmlFor="nequi-lastname">
                            Apellido
                          </label>
                          <input
                            id="nequi-lastname"
                            type="text"
                            autoComplete="family-name"
                            placeholder="Tu apellido"
                            className={nequiStyles.input}
                            value={nequiLastName}
                            onChange={(e) => setNequiLastName(e.target.value)}
                          />
                        </div>
                        <div className={nequiStyles.field}>
                          <label className={nequiStyles.label} htmlFor="nequi-legal-id">
                            C.C
                          </label>
                          <input
                            id="nequi-legal-id"
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={10}
                            placeholder="1020304050"
                            className={nequiStyles.input}
                            value={nequiLegalId}
                            onChange={(e) => setNequiLegalId(e.target.value.replace(/\D/g, "").slice(0, 10))}
                          />
                          {nequiLegalId && !nequiLegalIdValid && (
                            <p className={`${nequiStyles.hint} ${nequiStyles.error}`}>
                              La cédula tiene 10 dígitos.
                            </p>
                          )}
                        </div>
                        <div className={nequiStyles.field}>
                          <label className={nequiStyles.label} htmlFor="nequi-email">
                            Email
                          </label>
                          <input
                            id="nequi-email"
                            type="email"
                            autoComplete="email"
                            placeholder="tu@email.com"
                            className={nequiStyles.input}
                            value={buyer.email}
                            onChange={(e) => setBuyer({ ...buyer, email: e.target.value })}
                          />
                        </div>
                        <div className={nequiStyles.field} style={{ gridColumn: "1 / -1" }}>
                          <label className={nequiStyles.label} htmlFor="nequi-phone">
                            Número
                          </label>
                          <input
                            id="nequi-phone"
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel-national"
                            placeholder="300 123 4567"
                            className={nequiStyles.input}
                            value={nequiPhone}
                            onChange={(e) => setNequiPhone(e.target.value)}
                          />
                        </div>
                      </div>

                      <p
                        className={`${nequiStyles.hint} ${nequiPhone && !nequiPhoneValid ? nequiStyles.error : ""}`}
                      >
                        {nequiPhone && !nequiPhoneValid
                          ? "Celular colombiano inválido — 10 dígitos, empieza en 3."
                          : "Te va a llegar una notificación a tu app Nequi para aprobar el pago."}
                      </p>

                      <label className={nequiStyles.consentRow}>
                        <input
                          type="checkbox"
                          checked={nequiConsent}
                          onChange={(e) => setNequiConsent(e.target.checked)}
                        />
                        <span>
                          Autorizo el tratamiento de mis datos personales (incluida mi cédula) para identificar esta
                          compra, según la{" "}
                          <Link href="/privacidad" target="_blank">
                            Política de Privacidad
                          </Link>
                          .
                        </span>
                      </label>
                    </div>
                  ) : null
                }
              />
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
            <Link href="/terminos#reembolsos">condiciones de compra y reembolsos</Link>.
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
    </>
  );
}

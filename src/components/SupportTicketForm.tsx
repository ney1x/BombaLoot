"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import styles from "./SupportTicketForm.module.css";
import { ArrowLeftIcon, ChevronRightIcon } from "./icons";
import { useSession } from "@/lib/session-context";
import { saveTicketRef } from "@/lib/support-session";
import { SUPPORT_CATEGORIES, isOrderRequired, type SupportCategory } from "@/lib/support";

const CATEGORY_VALUES = SUPPORT_CATEGORIES.map((c) => c.value);

function isSupportCategory(value: string | null): value is SupportCategory {
  return value !== null && (CATEGORY_VALUES as string[]).includes(value);
}

export function SupportTicketForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useSession();
  // `?motivo=` viene del lanzador flotante (`AssistantLauncher`) — salta
  // directo al formulario con la categoría ya elegida, en vez de hacer
  // repetir al usuario un click que ya hizo en el panel de ayuda.
  const motivoParam = searchParams.get("motivo");
  const initialCategory = isSupportCategory(motivoParam) ? motivoParam : null;
  const [category, setCategory] = useState<SupportCategory | null>(initialCategory);
  const [orderNumberInput, setOrderNumberInput] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [message, setMessage] = useState("");
  // Solo para LOST_ORDER_NUMBER — no hay número de pedido que pedir, así
  // que esto (más el email) es lo que le da a soporte algo para buscar.
  // Los dos opcionales: van adentro del mensaje del ticket, no en campos
  // propios — no vale la pena una migración de columnas nuevas por dos
  // datos que igual necesitan lectura humana.
  const [paymentMethodInput, setPaymentMethodInput] = useState("");
  const [purchaseInput, setPurchaseInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderId = useId();
  const emailId = useId();
  const messageId = useId();
  const paymentMethodId = useId();
  const purchaseId = useId();

  // Sincroniza el email una vez que `useSession()` resuelve (llega async) —
  // solo si el campo sigue vacío, para no pisar algo que el invitado ya escribió.
  useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const categoryLabel = SUPPORT_CATEGORIES.find((c) => c.value === category)?.label;
  const orderRequired = category ? isOrderRequired(category) : false;
  // Pedir el número acá no tiene sentido: la premisa del motivo es
  // justamente que la persona no lo tiene.
  const isLostOrder = category === "LOST_ORDER_NUMBER";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;
    setSubmitting(true);
    setError(null);
    try {
      // Método de pago y qué compró (los dos opcionales) se arman adentro
      // del mensaje del ticket — ver el comentario en el estado de arriba.
      const finalMessage = isLostOrder
        ? [
            paymentMethodInput ? `Método de pago: ${paymentMethodInput}` : null,
            purchaseInput ? `Qué compró: ${purchaseInput}` : null,
            message,
          ]
            .filter(Boolean)
            .join("\n")
        : message;

      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          category,
          message: finalMessage,
          orderNumberInput: orderNumberInput || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "No pudimos enviar tu solicitud. Probá de nuevo.");
        return;
      }
      saveTicketRef({
        id: body.ticket.id,
        token: body.accessToken,
        ticketNumber: body.ticket.ticketNumber,
        createdAt: new Date().toISOString(),
      });
      router.push(`/ayuda/ticket/${body.ticket.id}?token=${encodeURIComponent(body.accessToken)}`);
    } catch {
      setError("No pudimos enviar tu solicitud. Probá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!category) {
    return (
      <div className={styles.categoryList}>
        {SUPPORT_CATEGORIES.map((c) => (
          <button key={c.value} type="button" className={styles.categoryButton} onClick={() => setCategory(c.value)}>
            {c.label}
            <ChevronRightIcon />
          </button>
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <button type="button" className={styles.back} onClick={() => setCategory(null)}>
        <ArrowLeftIcon /> Elegir otro motivo
      </button>
      <span className={styles.selectedCategory}>{categoryLabel}</span>

      <div className={styles.fields}>
        {!isLostOrder && (
          <label className={styles.field} htmlFor={orderId}>
            <span className={styles.label}>
              Número de pedido{" "}
              {orderRequired ? (
                <span className={styles.required}>(obligatorio para este motivo)</span>
              ) : (
                <span className={styles.optional}>(opcional, pero ayuda a resolver más rápido)</span>
              )}
            </span>
            <input
              id={orderId}
              type="text"
              className={styles.input}
              placeholder="Ej. A7F3-2291"
              required={orderRequired}
              value={orderNumberInput}
              onChange={(e) => setOrderNumberInput(e.target.value)}
            />
            {orderRequired && (
              <span className={styles.hint}>Lo encontrás en el email de confirmación o en tu pedido, en Mi cuenta.</span>
            )}
          </label>
        )}

        <label className={styles.field} htmlFor={emailId}>
          <span className={styles.label}>
            Email {isLostOrder && <span className={styles.required}>(obligatorio para este motivo)</span>}
          </span>
          <input
            id={emailId}
            type="email"
            className={styles.input}
            placeholder="tu@email.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            readOnly={Boolean(user)}
          />
          {isLostOrder && (
            <span className={styles.hint}>
              Tiene que ser el mismo con el que hiciste la compra — es lo único que tenemos para encontrar tu
              pedido sin el número.
            </span>
          )}
        </label>

        {isLostOrder && (
          <>
            <label className={styles.field} htmlFor={paymentMethodId}>
              <span className={styles.label}>
                Método de pago <span className={styles.optional}>(opcional, pero ayuda a resolver más rápido)</span>
              </span>
              <select
                id={paymentMethodId}
                className={styles.input}
                value={paymentMethodInput}
                onChange={(e) => setPaymentMethodInput(e.target.value)}
              >
                <option value="">Preferís no decir / no estoy seguro</option>
                <option value="Nequi">Nequi</option>
                <option value="PSE">PSE</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="PayPal">PayPal</option>
              </select>
            </label>

            <label className={styles.field} htmlFor={purchaseId}>
              <span className={styles.label}>
                ¿Qué compraste? <span className={styles.optional}>(opcional, pero ayuda a resolver más rápido)</span>
              </span>
              <input
                id={purchaseId}
                type="text"
                className={styles.input}
                placeholder="Ej. 565 VP de Valorant"
                value={purchaseInput}
                onChange={(e) => setPurchaseInput(e.target.value)}
              />
            </label>
          </>
        )}

        <label className={styles.field} htmlFor={messageId}>
          <span className={styles.label}>Contanos qué pasó</span>
          <textarea
            id={messageId}
            className={styles.textarea}
            placeholder="Mientras más detalle nos des, más rápido podemos ayudarte."
            required
            minLength={10}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <p className={styles.legal}>
          Al enviar esta solicitud, confirmás que leíste los <Link href="/terminos">Términos y Condiciones</Link> y
          la <Link href="/privacidad">Política de Privacidad</Link>.
        </p>

        <div className={styles.submitRow}>
          <button type="submit" className="btn btnPrimary" disabled={submitting}>
            {submitting ? "Enviando…" : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </form>
  );
}

"use client";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderId = useId();
  const emailId = useId();
  const messageId = useId();

  // Sincroniza el email una vez que `useSession()` resuelve (llega async) —
  // solo si el campo sigue vacío, para no pisar algo que el invitado ya escribió.
  useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const categoryLabel = SUPPORT_CATEGORIES.find((c) => c.value === category)?.label;
  const orderRequired = category ? isOrderRequired(category) : false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          category,
          message,
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

        <label className={styles.field} htmlFor={emailId}>
          <span className={styles.label}>Email</span>
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
        </label>

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

        <div className={styles.submitRow}>
          <button type="submit" className="btn btnPrimary" disabled={submitting}>
            {submitting ? "Enviando…" : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </form>
  );
}

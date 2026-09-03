"use client";

import { useState } from "react";
import shared from "@/app/admin/shared.module.css";

/**
 * Cambia a dónde llega el código de un pedido ya pagado — para cuando el
 * comprador perdió acceso al email original. Sensible a propósito: no basta
 * con estar en el panel, hay que probar identidad. El número de pedido y el
 * email acá NO se auto-completan con los datos reales — la idea es que el
 * admin se los pida a la persona (por el ticket) y los tipee, para que el
 * server los compare contra el pedido real (`changeOrderEmail` en el
 * backend). Solo se renderiza cuando el pedido está pagado y hay un ticket
 * abierto sobre él (ver página de detalle).
 */
export function ChangeOrderEmailAction({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [confirmOrderNumber, setConfirmOrderNumber] = useState("");
  const [confirmCurrentEmail, setConfirmCurrentEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ oldEmail: string; newEmail: string } | null>(null);

  if (done) {
    return (
      <div className={shared.formMsg} data-tone="good">
        Email de entrega cambiado: {done.oldEmail} → {done.newEmail}.
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className={shared.btnSmall} onClick={() => setOpen(true)}>
        Cambiar email de entrega
      </button>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/change-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmOrderNumber, confirmCurrentEmail, newEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cambiar el email");
      setDone({ oldEmail: data.oldEmail as string, newEmail: data.newEmail as string });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={shared.formMsg}
      data-tone="warn"
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      <span>
        Pedile a la persona, por el ticket, el número de pedido y el email con el que compró — el sistema los
        compara contra el pedido real antes de aplicar el cambio. No los completes vos de memoria.
      </span>
      <div className={shared.field}>
        <label htmlFor="confirm-order-number">Número de pedido que dio la persona</label>
        <input
          id="confirm-order-number"
          value={confirmOrderNumber}
          onChange={(e) => setConfirmOrderNumber(e.target.value)}
          placeholder="Ej: S2RE-CU9Q"
          required
        />
      </div>
      <div className={shared.field}>
        <label htmlFor="confirm-current-email">Email original que dio la persona</label>
        <input
          id="confirm-current-email"
          type="email"
          value={confirmCurrentEmail}
          onChange={(e) => setConfirmCurrentEmail(e.target.value)}
          placeholder="vos@email.com"
          required
        />
      </div>
      <div className={shared.field}>
        <label htmlFor="new-email">Nuevo email al que va a llegar el código</label>
        <input
          id="new-email"
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="nuevo@email.com"
          required
        />
      </div>
      {error && <span style={{ color: "var(--alert)" }}>{error}</span>}
      <div className={shared.actions}>
        <button type="submit" className={shared.btnSmall} disabled={submitting}>
          {submitting ? "Cambiando…" : "Confirmar cambio"}
        </button>
        <button type="button" className={shared.btnSmall} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

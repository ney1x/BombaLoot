"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

export interface RefundForAction {
  id: string;
  orderId: string;
  orderNumber: string;
  email: string;
  provider: string;
  amountCop: number | null;
  currency: string;
  formattedAmount: string;
}

/**
 * Acción peligrosa y explícita — no un botón "Procesar". Muestra qué va a
 * ocurrir (pedido, proveedor, importe), exige `providerRefundId` +
 * comentario obligatorio, y una confirmación aparte antes de enviar.
 */
export function ManualRefundAction({ refund, canExecute }: { refund: RefundForAction; canExecute: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [providerRefundId, setProviderRefundId] = useState("");
  const [comment, setComment] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!canExecute) {
    return <span className={shared.subtitle}>Solo ADMIN puede confirmar este reembolso</span>;
  }

  if (!open) {
    return (
      <button type="button" className={`${shared.btnSmall} ${shared.btnSmallDanger}`} onClick={() => setOpen(true)}>
        Confirmar reembolso manual
      </button>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!confirmed) {
      setError("Marcá la confirmación explícita antes de continuar.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/refunds/${refund.id}/manual-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: refund.orderId, providerRefundId: providerRefundId.trim(), comment: comment.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo confirmar el reembolso");
      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={shared.card}
      style={{ display: "flex", flexDirection: "column", gap: 12, borderColor: "var(--alert)" }}
    >
      <div className={shared.formMsg} data-tone="bad">
        Esto registra que <b>ya ejecutaste</b> un reembolso real fuera del sistema (consola del
        proveedor, transferencia manual). No llama a ningún proveedor — solo deja constancia.
        <br />
        Pedido <b>{refund.orderNumber}</b> ({refund.email}) · Proveedor <b>{refund.provider}</b> · Importe{" "}
        <b>{refund.formattedAmount}</b>
      </div>

      {error && <div className={shared.formMsg} data-tone="bad">{error}</div>}

      <div className={shared.field}>
        <label htmlFor={`ref-${refund.id}`}>Referencia real del proveedor (obligatoria)</label>
        <input
          id={`ref-${refund.id}`}
          value={providerRefundId}
          onChange={(e) => setProviderRefundId(e.target.value)}
          placeholder="ID del reembolso en Wompi/PayPal, o comprobante"
          required
          minLength={3}
        />
      </div>

      <div className={shared.field}>
        <label htmlFor={`comment-${refund.id}`}>Qué pasó y cómo se resolvió (obligatorio)</label>
        <textarea
          id={`comment-${refund.id}`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          required
          minLength={10}
        />
      </div>

      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        Confirmo que el reembolso de {refund.formattedAmount} a {refund.email} ya se ejecutó realmente y
        quedó verificado.
      </label>

      <div className={shared.actions}>
        <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallDanger}`} disabled={submitting}>
          {submitting ? "Confirmando…" : "Confirmar reembolso"}
        </button>
        <button type="button" className={shared.btnSmall} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

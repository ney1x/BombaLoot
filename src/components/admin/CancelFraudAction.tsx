"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

/**
 * Solo se renderiza para pedidos `payment_status = PENDING` (ver página de
 * detalle) — uno ya pagado va por reembolsos. Pero "sigue PENDING" cubre
 * dos casos muy distintos: `PAYMENT_EXPIRED` (el carrito venció solo, caso
 * rutinario) y `PENDING_PAYMENT` todavía dentro de ventana (más
 * plausiblemente sospechoso si un admin lo está mirando). Antes la copy
 * decía "Cancelar por fraude" para los dos casos por igual.
 */
export function CancelFraudAction({ orderId, expired }: { orderId: string; expired: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buttonLabel = expired ? "Cancelar (carrito vencido)" : "Cancelar por fraude";
  const placeholder = expired
    ? "Ej. limpieza de carrito abandonado"
    : "Ej. tarjeta reportada, patrón de compra sospechoso";

  if (!open) {
    return (
      <button type="button" className={`${shared.btnSmall} ${shared.btnSmallDanger}`} onClick={() => setOpen(true)}>
        {buttonLabel}
      </button>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/cancel-fraud`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cancelar el pedido");
      router.refresh();
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
        Esto marca el pedido como FAILED y libera de vuelta al inventario cualquier código
        reservado. Solo aplica a pedidos que todavía no pagaron — si este ya cobró, usá el flujo
        de reembolsos en cambio.
      </div>
      {error && <div className={shared.formMsg} data-tone="bad">{error}</div>}
      <div className={shared.field}>
        <label htmlFor="cancel-reason">Motivo (obligatorio)</label>
        <input
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder}
          required
          minLength={5}
        />
      </div>
      <div className={shared.actions}>
        <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallDanger}`} disabled={submitting}>
          {submitting ? "Cancelando…" : "Confirmar cancelación"}
        </button>
        <button type="button" className={shared.btnSmall} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import shared from "@/app/admin/shared.module.css";

/**
 * Para cuando el email de entrega original no llegó (o el comprador no
 * guardó el código) y soporte necesita ayudarlo. El código NUNCA pasa por
 * esta pantalla ni por la respuesta del servidor — se descifra server-side
 * y se manda directo al email del pedido, el mismo nivel de exposición que
 * ya existe hoy (nadie con acceso admin ve el texto plano). Solo se
 * renderiza cuando ya hay algo entregado (ver página de detalle).
 */
export function ResendCodesAction({ orderId, orderEmail }: { orderId: string; orderEmail: string }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <div className={shared.formMsg} data-tone="good">
        Reenviado a {sentTo}.
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className={shared.btnSmall} onClick={() => setOpen(true)}>
        Reenviar código por email
      </button>
    );
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/resend-codes`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo reenviar el código");
      setSentTo(data.email as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={shared.formMsg} data-tone="warn" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span>
        Va a mandar el código de nuevo a <b>{orderEmail}</b> — el mismo email del pedido, no uno que escribas
        acá. Si el problema es que esa dirección está mal, hay que corregirla primero.
      </span>
      {error && <span style={{ color: "var(--alert)" }}>{error}</span>}
      <div className={shared.actions}>
        <button type="button" className={shared.btnSmall} disabled={submitting} onClick={() => void handleConfirm()}>
          {submitting ? "Reenviando…" : "Confirmar reenvío"}
        </button>
        <button type="button" className={shared.btnSmall} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

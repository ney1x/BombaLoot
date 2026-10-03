"use client";

import { useState } from "react";
import shared from "@/app/admin/shared.module.css";

/**
 * Para cuando el pago ya se confirmó pero el flujo normal del cliente en
 * `/pedido/[id]` nunca completó la entrega (token de acceso perdido, el
 * fetch de códigos falló en silencio, etc.) — el pedido queda `PAID` con
 * `deliveryStatus` distinto de `DELIVERED` para siempre, sin que
 * `ResendCodesAction` tenga nada que reenviar (esa acción solo existe
 * cuando ya hubo una entrega previa). El código NUNCA pasa por esta
 * pantalla ni por la respuesta del servidor — se descifra server-side y se
 * manda directo al email del pedido. Solo se renderiza cuando el pedido
 * está pagado y todavía no se entregó (ver página de detalle).
 */
export function DeliverCodesAction({ orderId, orderEmail }: { orderId: string; orderEmail: string }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <div className={shared.formMsg} data-tone="good">
        Entregado y enviado a {sentTo}.
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className={shared.btnSmall} onClick={() => setOpen(true)}>
        Entregar códigos por email
      </button>
    );
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/deliver-codes`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo entregar el código");
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
        Va a descifrar los códigos pagos de este pedido, marcarlos como entregados y mandarlos a{" "}
        <b>{orderEmail}</b> — el mismo email del pedido, no uno que escribas acá. Si el problema es que esa
        dirección está mal, hay que corregirla primero.
      </span>
      {error && <span style={{ color: "var(--alert)" }}>{error}</span>}
      <div className={shared.actions}>
        <button type="button" className={shared.btnSmall} disabled={submitting} onClick={() => void handleConfirm()}>
          {submitting ? "Entregando…" : "Confirmar entrega"}
        </button>
        <button type="button" className={shared.btnSmall} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

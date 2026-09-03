"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

/**
 * El email de un ticket, clickeable — a diferencia del número de pedido
 * (que ya linkea al detalle cuando el ticket lo resolvió al crearse), el
 * email es lo único que siempre está, incluso en motivos donde nunca hubo
 * número de pedido para empezar (`LOST_ORDER_NUMBER`). Antes de navegar
 * chequea si el email tiene compras — si no las tiene, avisa acá mismo en
 * vez de mandar al admin a una lista de pedidos vacía.
 */
export function EmailOrdersLink({ email }: { email: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [noOrders, setNoOrders] = useState(false);

  async function handleClick() {
    setChecking(true);
    setNoOrders(false);
    try {
      const res = await fetch(`/api/admin/orders?email=${encodeURIComponent(email)}&limit=1`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.orders) && data.orders.length > 0) {
        router.push(`/admin/pedidos?email=${encodeURIComponent(email)}`);
        return;
      }
      setNoOrders(true);
    } catch {
      setNoOrders(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={checking}
        title="Ver compras con este email"
        style={{
          background: "none",
          border: "none",
          padding: 0,
          margin: 0,
          font: "inherit",
          color: "inherit",
          textDecoration: "underline",
          textUnderlineOffset: 2,
          cursor: checking ? "default" : "pointer",
        }}
      >
        {email}
      </button>
      {checking && <span className={shared.subtitle}>Buscando…</span>}
      {noOrders && (
        <span className={shared.subtitle} style={{ color: "var(--alert)" }}>
          Sin compras registradas con este email
        </span>
      )}
    </span>
  );
}

"use client";

import { useState } from "react";
import { formatCop } from "@/lib/products";

interface UserDetail {
  totalSpentCop: number;
  ordersCount: number;
  loyaltyTier: { id: string; name: string; discountPct: number } | null;
  activeSessionsCount: number;
}

/**
 * `getUserDetailAdmin`/`GET /api/admin/users/[id]` ya calculaban esto
 * (spend, pedidos, tier, sesiones activas) pero nada en la UI lo pedía —
 * quedaba enterrado. Expande inline en la misma celda, sin tocar la
 * estructura de la tabla ni disparar el fetch hasta que alguien lo pide.
 */
export function UserDetailToggle({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (detail || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el detalle");
      setDetail(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span>{email}</span>
        <button
          type="button"
          onClick={() => void toggle()}
          aria-expanded={open}
          style={{
            border: "none",
            background: "none",
            color: "var(--accent)",
            fontSize: 11,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {open ? "▾ ocultar" : "▸ detalle"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--ink-soft)" }}>
          {loading && "Cargando…"}
          {error && <span style={{ color: "var(--alert)" }}>{error}</span>}
          {detail && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span>Gastado (pedidos pagos): {formatCop(detail.totalSpentCop)}</span>
              <span>Pedidos totales: {detail.ordersCount}</span>
              <span>
                Fidelización:{" "}
                {detail.loyaltyTier ? `${detail.loyaltyTier.name} (${detail.loyaltyTier.discountPct}% desc.)` : "sin nivel"}
              </span>
              <span>Sesiones activas: {detail.activeSessionsCount}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

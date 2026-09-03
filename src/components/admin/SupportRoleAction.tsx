"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

/** Asignar/retirar SUPPORT — reutiliza los endpoints de fase 6A. Solo se renderiza para ADMIN (ver usuarios/page.tsx). */
export function SupportRoleAction({ userId, role }: { userId: string; role: "CUSTOMER" | "ADMIN" | "SUPPORT" }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<"POST" | "DELETE" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "POST" | "DELETE") {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/support`, { method });
      const data = await res.json();
      if (!res.ok) {
        const fieldMsgs = data.fields ? Object.values(data.fields).flat().join(" ") : "";
        throw new Error([data.error, fieldMsgs].filter(Boolean).join(" — ") || "No se pudo cambiar el rol");
      }
      router.refresh();
      setConfirming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  if (role === "ADMIN") return <span className={shared.subtitle}>—</span>;

  if (confirming) {
    const label = confirming === "POST" ? "Hacer SUPPORT" : "Quitar SUPPORT";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
        {error && <span style={{ fontSize: 11, color: "var(--alert)" }}>{error}</span>}
        <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>¿Confirmás &quot;{label}&quot;?</span>
        <div className={shared.actions}>
          <button
            type="button"
            className={`${shared.btnSmall} ${shared.btnSmallDanger}`}
            disabled={submitting}
            onClick={() => void call(confirming)}
          >
            {submitting ? "Aplicando…" : "Confirmar"}
          </button>
          <button type="button" className={shared.btnSmall} disabled={submitting} onClick={() => setConfirming(null)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {error && <span style={{ fontSize: 11, color: "var(--alert)" }}>{error}</span>}
      {role === "CUSTOMER" ? (
        <button type="button" className={shared.btnSmall} onClick={() => setConfirming("POST")}>
          Hacer SUPPORT
        </button>
      ) : (
        <button type="button" className={`${shared.btnSmall} ${shared.btnSmallDanger}`} onClick={() => setConfirming("DELETE")}>
          Quitar SUPPORT
        </button>
      )}
    </div>
  );
}

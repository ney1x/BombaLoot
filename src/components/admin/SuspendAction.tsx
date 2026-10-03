"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

/**
 * ADMIN y SUPPORT pueden suspender/reactivar — a diferencia del rol, esto no
 * está limitado a ADMIN (ver `suspendUser`/`unsuspendUser`: ninguno de los
 * dos puede tocar su propia cuenta ni la de un ADMIN, el servidor lo repite
 * igual aunque este componente ya oculte esos casos).
 */
export function SuspendAction({
  userId,
  role,
  suspended,
  isSelf,
}: {
  userId: string;
  role: "CUSTOMER" | "ADMIN" | "SUPPORT" | "SUPERADMIN";
  suspended: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (role === "ADMIN" || role === "SUPERADMIN" || isSelf) return <span className={shared.subtitle}>—</span>;

  async function handleSuspend(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldMsgs = data.fields ? Object.values(data.fields).flat().join(" ") : "";
        throw new Error([data.error, fieldMsgs].filter(Boolean).join(" — ") || "No se pudo suspender");
      }
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnsuspend() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/suspend`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        const fieldMsgs = data.fields ? Object.values(data.fields).flat().join(" ") : "";
        throw new Error([data.error, fieldMsgs].filter(Boolean).join(" — ") || "No se pudo reactivar");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  if (suspended) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {error && <span style={{ fontSize: 11, color: "var(--alert)" }}>{error}</span>}
        <button type="button" className={shared.btnSmall} disabled={submitting} onClick={handleUnsuspend}>
          {submitting ? "Reactivando…" : "Reactivar"}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className={`${shared.btnSmall} ${shared.btnSmallDanger}`} onClick={() => setOpen(true)}>
        Suspender
      </button>
    );
  }

  return (
    <form onSubmit={handleSuspend} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
      {error && <span style={{ fontSize: 11, color: "var(--alert)" }}>{error}</span>}
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (obligatorio)"
        required
        minLength={5}
        maxLength={500}
      />
      <div className={shared.actions}>
        <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallDanger}`} disabled={submitting}>
          {submitting ? "Suspendiendo…" : "Confirmar"}
        </button>
        <button type="button" className={shared.btnSmall} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

/** Asignar/retirar SUPPORT — reutiliza los endpoints de fase 6A. Solo se renderiza para ADMIN (ver usuarios/page.tsx). */
export function SupportRoleAction({ userId, role }: { userId: string; role: "CUSTOMER" | "ADMIN" | "SUPPORT" }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "POST" | "DELETE") {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/support`, { method });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cambiar el rol");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  if (role === "ADMIN") return <span className={shared.subtitle}>—</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {error && <span style={{ fontSize: 11, color: "var(--alert)" }}>{error}</span>}
      {role === "CUSTOMER" ? (
        <button type="button" className={shared.btnSmall} disabled={submitting} onClick={() => call("POST")}>
          Hacer SUPPORT
        </button>
      ) : (
        <button type="button" className={`${shared.btnSmall} ${shared.btnSmallDanger}`} disabled={submitting} onClick={() => call("DELETE")}>
          Quitar SUPPORT
        </button>
      )}
    </div>
  );
}

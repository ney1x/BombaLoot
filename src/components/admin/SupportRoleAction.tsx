"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

type Action = "MAKE_SUPPORT" | "REMOVE_SUPPORT" | "REMOVE_ADMIN" | "RESTORE_ADMIN";

const ACTION_CONFIG: Record<Action, { method: "POST" | "DELETE"; path: (id: string) => string; label: string }> = {
  MAKE_SUPPORT: { method: "POST", path: (id) => `/api/admin/users/${id}/support`, label: "Hacer SUPPORT" },
  REMOVE_SUPPORT: { method: "DELETE", path: (id) => `/api/admin/users/${id}/support`, label: "Quitar SUPPORT" },
  REMOVE_ADMIN: { method: "DELETE", path: (id) => `/api/admin/users/${id}/admin-role`, label: "Quitar ADMIN" },
  RESTORE_ADMIN: { method: "POST", path: (id) => `/api/admin/users/${id}/admin-role`, label: "Volver a hacer ADMIN" },
};

/**
 * Asignar/retirar SUPPORT — cualquier ADMIN o SUPERADMIN. Quitar/restaurar
 * ADMIN — SUPERADMIN-only (el servidor lo exige igual vía
 * `requireSuperAdminApi`; `canManageAdmins` acá solo decide si mostrar el
 * botón, no reemplaza esa verificación). Una fila SUPERADMIN nunca muestra
 * acciones — no hay flujo para tocar ese rol desde este panel.
 */
export function SupportRoleAction({
  userId,
  role,
  isSelf,
  wasAdmin,
  canManageAdmins,
}: {
  userId: string;
  role: "CUSTOMER" | "ADMIN" | "SUPPORT" | "SUPERADMIN";
  isSelf?: boolean;
  /** Tuvo ADMIN antes y se lo sacaron — habilita "Volver a hacer ADMIN". */
  wasAdmin?: boolean;
  /** Sesión actual es SUPERADMIN — habilita quitar/restaurar ADMIN. */
  canManageAdmins?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(action: Action) {
    setSubmitting(true);
    setError(null);
    try {
      const { method, path } = ACTION_CONFIG[action];
      const res = await fetch(path(userId), { method });
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

  if (role === "SUPERADMIN") return <span className={shared.subtitle}>—</span>;

  if (confirming) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
        {error && <span style={{ fontSize: 11, color: "var(--alert)" }}>{error}</span>}
        <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>
          ¿Confirmás &quot;{ACTION_CONFIG[confirming].label}&quot;?
        </span>
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

  if (role === "ADMIN") {
    if (isSelf || !canManageAdmins) return <span className={shared.subtitle}>—</span>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {error && <span style={{ fontSize: 11, color: "var(--alert)" }}>{error}</span>}
        <button
          type="button"
          className={`${shared.btnSmall} ${shared.btnSmallDanger}`}
          onClick={() => setConfirming("REMOVE_ADMIN")}
        >
          Quitar ADMIN
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {error && <span style={{ fontSize: 11, color: "var(--alert)" }}>{error}</span>}
      {wasAdmin && canManageAdmins && (
        <button type="button" className={shared.btnSmall} onClick={() => setConfirming("RESTORE_ADMIN")}>
          Volver a hacer ADMIN
        </button>
      )}
      {role === "CUSTOMER" ? (
        <button type="button" className={shared.btnSmall} onClick={() => setConfirming("MAKE_SUPPORT")}>
          Hacer SUPPORT
        </button>
      ) : (
        <button
          type="button"
          className={`${shared.btnSmall} ${shared.btnSmallDanger}`}
          onClick={() => setConfirming("REMOVE_SUPPORT")}
        >
          Quitar SUPPORT
        </button>
      )}
    </div>
  );
}

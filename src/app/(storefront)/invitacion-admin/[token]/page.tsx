"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PaymentStatusLayout } from "@/components/PaymentStatusLayout";
import { ShieldCheckIcon, AlertIcon, CheckIcon } from "@/components/icons";
import { useSession } from "@/lib/session-context";

/**
 * Aceptar una invitación a ADMIN — pública (bajo `(storefront)`, no
 * `/admin`) a propósito: quien todavía no es admin no puede pasar por el
 * layout de `/admin`, que exige el rol antes de mostrar nada. Requiere
 * sesión iniciada con el mismo email al que se mandó la invitación; el
 * servidor (`acceptAdminInvite`) es quien de verdad valida eso, esto solo
 * guía la UI.
 */
export default function AdminInvitePage() {
  const params = useParams<{ token: string }>();
  const { user, loading, refresh } = useSession();
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const currentPath = `/invitacion-admin/${params.token}`;

  async function accept() {
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/auth/admin-invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos aceptar la invitación.");
        setStatus("idle");
        return;
      }
      await refresh();
      setStatus("done");
    } catch {
      setError("No pudimos conectarnos. Probá de nuevo en un momento.");
      setStatus("idle");
    }
  }

  if (loading) {
    return <PaymentStatusLayout tone="neutral" icon={<ShieldCheckIcon />} title="Cargando…" />;
  }

  if (status === "done") {
    return (
      <PaymentStatusLayout
        tone="good"
        icon={<CheckIcon />}
        title="¡Listo! Ya sos administrador"
        subtitle="Ya podés entrar al panel de administración con esta cuenta."
      >
        <Link href="/admin" className="btn btnPrimary">
          Ir al panel admin
        </Link>
      </PaymentStatusLayout>
    );
  }

  if (!user) {
    return (
      <PaymentStatusLayout
        tone="neutral"
        icon={<ShieldCheckIcon />}
        title="Te invitaron a administrar BombaLoot"
        subtitle="Iniciá sesión o creá una cuenta con el mismo email al que te llegó esta invitación para aceptarla."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href={`/cuenta/login?next=${encodeURIComponent(currentPath)}`} className="btn btnPrimary">
            Iniciar sesión
          </Link>
          <Link href={`/cuenta/registro?next=${encodeURIComponent(currentPath)}`} className="btn btnSecondary">
            Crear cuenta
          </Link>
        </div>
      </PaymentStatusLayout>
    );
  }

  if (user.role === "ADMIN" || user.role === "SUPERADMIN") {
    return (
      <PaymentStatusLayout
        tone="good"
        icon={<CheckIcon />}
        title="Ya sos administrador"
        subtitle={`Esta cuenta (${user.email}) ya tiene rol ${user.role}.`}
      >
        <Link href="/admin" className="btn btnPrimary">
          Ir al panel admin
        </Link>
      </PaymentStatusLayout>
    );
  }

  return (
    <PaymentStatusLayout
      tone="neutral"
      icon={<ShieldCheckIcon />}
      title="Te invitaron a administrar BombaLoot"
      subtitle={`Confirmá para aceptar con ${user.email}.`}
    >
      {error && (
        <p style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "var(--alert)", fontSize: 13.5 }}>
          <AlertIcon />
          {error}
        </p>
      )}
      <button type="button" className="btn btnPrimary" disabled={status === "submitting"} onClick={() => void accept()}>
        {status === "submitting" ? "Aceptando…" : "Aceptar invitación"}
      </button>
    </PaymentStatusLayout>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

export interface AdminInviteRow {
  id: string;
  email: string;
  invitedByEmail: string | null;
  expiresAt: string;
  createdAt: string;
}

/** Invitar/revocar ADMIN por email — promover de verdad pasa por `acceptAdminInvite`, nunca desde acá directamente. */
export function AdminInviteManager({ initialInvites }: { initialInvites: AdminInviteRow[] }) {
  const router = useRouter();
  const [invites, setInvites] = useState(initialInvites);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resentId, setResentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar la invitación");
      setEmail("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend(id: string) {
    setError(null);
    setResendingId(id);
    try {
      const res = await fetch(`/api/admin/invites/${id}/resend`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo reenviar la invitación");
      setResentId(id);
      router.refresh();
      setTimeout(() => setResentId((current) => (current === id ? null : current)), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setResendingId(null);
    }
  }

  async function handleRevoke(id: string) {
    setError(null);
    setRevokingId(id);
    try {
      const res = await fetch(`/api/admin/invites/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo revocar la invitación");
      setInvites((prev) => prev.filter((i) => i.id !== id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <h2 className={shared.title} style={{ fontSize: 15, margin: 0 }}>
          Invitar ADMIN
        </h2>
        <p className={shared.subtitle}>
          Manda un link por email — vence en 7 días. Quien lo reciba tiene que iniciar sesión o crear una
          cuenta con ese mismo email para poder aceptarlo.
        </p>
      </div>

      {error && (
        <div className={shared.formMsg} data-tone="bad">
          {error}
        </div>
      )}

      <form onSubmit={handleInvite} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className={shared.field} style={{ flex: "1 1 260px" }}>
          <label htmlFor="admin-invite-email">Email</label>
          <input
            id="admin-invite-email"
            type="email"
            required
            placeholder="persona@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallPrimary}`} disabled={submitting || !email.trim()}>
          {submitting ? "Enviando…" : "Invitar"}
        </button>
      </form>

      {invites.length === 0 ? (
        <p className={shared.subtitle}>Sin invitaciones pendientes.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {invites.map((invite) => (
            <div key={invite.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13 }}>{invite.email}</span>
              <span className={shared.mono} style={{ fontSize: 11, color: "var(--ink-faint)" }}>
                vence {new Date(invite.expiresAt).toLocaleDateString("es-CO")}
              </span>
              {invite.invitedByEmail && (
                <span className={shared.mono} style={{ fontSize: 11, color: "var(--ink-faint)" }}>
                  por {invite.invitedByEmail}
                </span>
              )}
              {resentId === invite.id && (
                <span className={shared.badge} data-tone="good">
                  Reenviado
                </span>
              )}
              <button
                type="button"
                className={shared.btnSmall}
                disabled={resendingId === invite.id}
                onClick={() => void handleResend(invite.id)}
              >
                {resendingId === invite.id ? "Reenviando…" : "Reenviar"}
              </button>
              <button
                type="button"
                className={`${shared.btnSmall} ${shared.btnSmallDanger}`}
                disabled={revokingId === invite.id}
                onClick={() => void handleRevoke(invite.id)}
              >
                {revokingId === invite.id ? "Revocando…" : "Revocar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

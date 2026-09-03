"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

export interface BlockedIpItem {
  ip: string;
  reason: string;
  blockedByEmail: string | null;
  createdAt: string;
}

function fieldErrorText(data: { error?: string; fields?: Record<string, string[]> }, fallback: string): string {
  const fieldMsgs = data.fields ? Object.values(data.fields).flat().join(" ") : "";
  return [data.error, fieldMsgs].filter(Boolean).join(" — ") || fallback;
}

export function IpBlocksManager({ initialBlocks }: { initialBlocks: BlockedIpItem[] }) {
  const router = useRouter();
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Confirmación explícita antes de ejecutar — bloquear/desbloquear es de un click, sin esto. */
  const [pendingBlock, setPendingBlock] = useState<{ ip: string; reason: string; existing: BlockedIpItem | null } | null>(
    null,
  );
  const [pendingUnblock, setPendingUnblock] = useState<string | null>(null);

  function handleBlockSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const existing = initialBlocks.find((b) => b.ip === ip.trim()) ?? null;
    setPendingBlock({ ip: ip.trim(), reason: reason.trim(), existing });
  }

  async function confirmBlock() {
    if (!pendingBlock) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/security/ip-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: pendingBlock.ip, reason: pendingBlock.reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(fieldErrorText(data, "No se pudo bloquear la IP"));
      setIp("");
      setReason("");
      setPendingBlock(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmUnblock(target: string) {
    setRemoving(target);
    setError(null);
    try {
      const res = await fetch(`/api/admin/security/ip-blocks/${encodeURIComponent(target)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(fieldErrorText(data, "No se pudo desbloquear la IP"));
      setPendingUnblock(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <form onSubmit={handleBlockSubmit} className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className={shared.formGrid}>
          <div className={shared.field}>
            <label htmlFor="ip">IP a bloquear</label>
            <input
              id="ip"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="Ej. 190.85.12.4 (sin rangos CIDR)"
              required
              minLength={3}
            />
          </div>
          <div className={shared.field}>
            <label htmlFor="reason">Motivo</label>
            <input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. intentos de fraude repetidos"
              required
              minLength={5}
              maxLength={500}
            />
          </div>
        </div>
        {error && <div className={shared.formMsg} data-tone="bad">{error}</div>}

        {pendingBlock ? (
          <div className={shared.formMsg} data-tone="bad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendingBlock.existing ? (
              <span>
                <b>{pendingBlock.ip}</b> ya está bloqueada por <b>{pendingBlock.existing.blockedByEmail ?? "—"}</b> con
                motivo &quot;{pendingBlock.existing.reason}&quot;. Confirmar reemplaza ese motivo y quién bloqueó.
              </span>
            ) : (
              <span>
                Vas a bloquear <b>{pendingBlock.ip}</b>: no va a poder registrarse, iniciar sesión, comprar ni abrir
                tickets de soporte. ¿Confirmás?
              </span>
            )}
            <div className={shared.actions}>
              <button
                type="button"
                className={`${shared.btnSmall} ${shared.btnSmallDanger}`}
                disabled={submitting}
                onClick={() => void confirmBlock()}
              >
                {submitting ? "Bloqueando…" : "Confirmar bloqueo"}
              </button>
              <button type="button" className={shared.btnSmall} disabled={submitting} onClick={() => setPendingBlock(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className={shared.actions}>
            <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallPrimary}`}>
              Bloquear IP
            </button>
          </div>
        )}
      </form>

      <div className={shared.tableWrap}>
        <table className={shared.table}>
          <thead>
            <tr>
              <th>IP</th>
              <th>Motivo</th>
              <th>Bloqueada por</th>
              <th>Desde</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {initialBlocks.map((b) => (
              <tr key={b.ip}>
                <td className={shared.mono}>{b.ip}</td>
                <td>{b.reason}</td>
                <td>{b.blockedByEmail ?? "—"}</td>
                <td>{new Date(b.createdAt).toLocaleString("es-CO")}</td>
                <td>
                  {pendingUnblock === b.ip ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>¿Desbloquear {b.ip}?</span>
                      <div className={shared.actions}>
                        <button
                          type="button"
                          className={`${shared.btnSmall} ${shared.btnSmallDanger}`}
                          disabled={removing === b.ip}
                          onClick={() => void confirmUnblock(b.ip)}
                        >
                          {removing === b.ip ? "Quitando…" : "Confirmar"}
                        </button>
                        <button type="button" className={shared.btnSmall} onClick={() => setPendingUnblock(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`${shared.btnSmall} ${shared.btnSmallDanger}`}
                      onClick={() => setPendingUnblock(b.ip)}
                    >
                      Desbloquear
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {initialBlocks.length === 0 && (
              <tr>
                <td colSpan={5} className={shared.empty}>
                  Sin IPs bloqueadas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

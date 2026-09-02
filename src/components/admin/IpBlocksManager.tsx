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

export function IpBlocksManager({ initialBlocks }: { initialBlocks: BlockedIpItem[] }) {
  const router = useRouter();
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBlock(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/security/ip-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo bloquear la IP");
      setIp("");
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnblock(target: string) {
    setRemoving(target);
    setError(null);
    try {
      const res = await fetch(`/api/admin/security/ip-blocks/${encodeURIComponent(target)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo desbloquear la IP");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <form onSubmit={handleBlock} className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className={shared.formGrid}>
          <div className={shared.field}>
            <label htmlFor="ip">IP a bloquear</label>
            <input id="ip" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="Ej. 190.85.12.4" required minLength={3} />
          </div>
          <div className={shared.field}>
            <label htmlFor="reason">Motivo</label>
            <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. intentos de fraude repetidos" required minLength={5} />
          </div>
        </div>
        {error && <div className={shared.formMsg} data-tone="bad">{error}</div>}
        <div className={shared.actions}>
          <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallPrimary}`} disabled={submitting}>
            {submitting ? "Bloqueando…" : "Bloquear IP"}
          </button>
        </div>
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
                  <button
                    type="button"
                    className={shared.btnSmall}
                    disabled={removing === b.ip}
                    onClick={() => handleUnblock(b.ip)}
                  >
                    {removing === b.ip ? "Quitando…" : "Desbloquear"}
                  </button>
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

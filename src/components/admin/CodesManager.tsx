"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

export interface AdminCode {
  id: string;
  status: string;
  fingerprint: string;
  orderItemId: string | null;
  createdAt: string;
  deliveredAt: string | null;
  uploadedById: string | null;
  uploadedByName: string | null;
}

const STATUS_TONE: Record<string, string> = {
  AVAILABLE: "good",
  RESERVED: "warn",
  PAID: "accent",
  DELIVERED: "accent",
  VOID: "bad",
};

export function CodesManager({
  productId,
  initialCodes,
  canEdit,
  currentUserId,
}: {
  productId: string;
  initialCodes: AdminCode[];
  canEdit: boolean;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [codes, setCodes] = useState(initialCodes);
  const [bulkText, setBulkText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/admin/products/${productId}/codes`);
    const data = await res.json();
    if (res.ok) setCodes(data.codes);
  }

  async function handleBulkAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    const lines = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/products/${productId}/codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: lines, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el lote");
      setResult(`Cargados ${data.inserted}, duplicados ${data.duplicates}.`);
      setBulkText("");
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(codeId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/codes/${codeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: editValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo editar");
      setEditingId(null);
      setEditValue("");
      hideCode(codeId);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  function hideCode(codeId: string) {
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[codeId];
      return next;
    });
  }

  async function toggleReveal(codeId: string) {
    if (revealed[codeId] !== undefined) {
      hideCode(codeId);
      return;
    }
    setError(null);
    setRevealingId(codeId);
    try {
      const res = await fetch(`/api/admin/codes/${codeId}/reveal`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo revelar el código");
      setRevealed((prev) => ({ ...prev, [codeId]: data.code }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setRevealingId(null);
    }
  }

  async function removeCode(codeId: string) {
    if (!window.confirm("¿Eliminar este código? Solo funciona si sigue AVAILABLE.")) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/codes/${codeId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo eliminar");
      hideCode(codeId);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div className={shared.formMsg} data-tone="bad">{error}</div>}
      {result && <div className={shared.formMsg} data-tone="good">{result}</div>}

      {canEdit && (
        <form onSubmit={handleBulkAdd} className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className={shared.field}>
            <label htmlFor="bulk">Cargar códigos (uno por línea)</label>
            <textarea
              id="bulk"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"VLR-AB12-CD34\nVLR-EF56-GH78"}
              rows={5}
            />
          </div>
          <div className={shared.field}>
            <label htmlFor="note">Nota del lote (opcional)</label>
            <input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Compra proveedor X, factura #123" />
          </div>
          <div className={shared.actions}>
            <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallPrimary}`} disabled={submitting}>
              {submitting ? "Cargando…" : "Cargar códigos"}
            </button>
          </div>
        </form>
      )}

      <div className={shared.tableWrap}>
        <table className={shared.table}>
          <thead>
            <tr>
              <th>Fingerprint</th>
              <th>Estado</th>
              <th>Subido por</th>
              <th>Cargado</th>
              <th>Entregado</th>
              {canEdit && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => {
              const isOwner = !c.uploadedById || c.uploadedById === currentUserId;
              const canReveal = canEdit && isOwner && c.status === "AVAILABLE";
              return (
              <tr key={c.id}>
                <td className={shared.mono}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{revealed[c.id] ?? c.fingerprint}</span>
                    {canReveal && (
                      <button
                        type="button"
                        className={shared.btnSmall}
                        onClick={() => toggleReveal(c.id)}
                        disabled={revealingId === c.id}
                        aria-label={revealed[c.id] !== undefined ? "Ocultar código" : "Ver código"}
                        title={revealed[c.id] !== undefined ? "Ocultar código" : "Ver código"}
                        style={{ display: "inline-flex", padding: 4 }}
                      >
                        {revealed[c.id] !== undefined ? (
                          <EyeOffIcon width={14} height={14} />
                        ) : (
                          <EyeIcon width={14} height={14} />
                        )}
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  <span className={shared.badge} data-tone={STATUS_TONE[c.status]}>
                    {c.status}
                  </span>
                </td>
                <td>{c.uploadedByName ?? "—"}</td>
                <td>{new Date(c.createdAt).toLocaleDateString("es-CO")}</td>
                <td>{c.deliveredAt ? new Date(c.deliveredAt).toLocaleDateString("es-CO") : "—"}</td>
                {canEdit && (
                  <td>
                    {c.status === "AVAILABLE" && !isOwner ? (
                      <span className={shared.subtitle}>de otro admin</span>
                    ) : c.status === "AVAILABLE" ? (
                      editingId === c.id ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="Código correcto"
                            style={{ fontSize: 12, padding: "4px 6px" }}
                          />
                          <button type="button" className={shared.btnSmall} onClick={() => saveEdit(c.id)}>
                            OK
                          </button>
                          <button type="button" className={shared.btnSmall} onClick={() => setEditingId(null)}>
                            X
                          </button>
                        </div>
                      ) : (
                        <div className={shared.actions}>
                          <button
                            type="button"
                            className={shared.btnSmall}
                            onClick={() => {
                              setEditingId(c.id);
                              setEditValue(revealed[c.id] ?? "");
                            }}
                          >
                            Editar
                          </button>
                          <button type="button" className={`${shared.btnSmall} ${shared.btnSmallDanger}`} onClick={() => removeCode(c.id)}>
                            Eliminar
                          </button>
                        </div>
                      )
                    ) : (
                      <span className={shared.subtitle}>inmutable</span>
                    )}
                  </td>
                )}
              </tr>
              );
            })}
            {codes.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className={shared.empty}>
                  Sin códigos cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

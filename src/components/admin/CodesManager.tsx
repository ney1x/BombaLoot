"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";
import { STATUS_LABEL, STATUS_TONE } from "@/app/admin/code-status-labels";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

export interface AdminCode {
  id: string;
  status: string;
  fingerprint: string;
  orderItemId: string | null;
  /** Solo PAID/DELIVERED lo tienen — el fingerprint linkea a la factura
      del pedido cuando está presente. */
  orderId: string | null;
  orderNumber: string | null;
  createdAt: string;
  deliveredAt: string | null;
  uploadedById: string | null;
  uploadedByName: string | null;
}

const STATUS_OPTIONS = ["AVAILABLE", "RESERVED", "PAID", "DELIVERED", "VOID"];

/** Fecha + hora — antes solo mostraba la fecha, sin forma de distinguir
    dos códigos cargados el mismo día. */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** YYYY-MM-DD en la zona horaria local — mismo formato que devuelve un
    <input type="date">, para poder comparar contra él directamente. */
function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [loadedDateFilter, setLoadedDateFilter] = useState("");
  const [deliveredDateFilter, setDeliveredDateFilter] = useState("");
  const [page, setPage] = useState(0);

  const hasActiveFilters =
    search || statusFilter || sortOrder !== "desc" || loadedDateFilter || deliveredDateFilter;

  const visibleCodes = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = codes.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (term && !c.fingerprint.toLowerCase().includes(term)) return false;
      if (loadedDateFilter && toDateInputValue(c.createdAt) !== loadedDateFilter) return false;
      if (deliveredDateFilter && (!c.deliveredAt || toDateInputValue(c.deliveredAt) !== deliveredDateFilter))
        return false;
      return true;
    });
    return filtered.sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === "desc" ? -diff : diff;
    });
  }, [codes, search, statusFilter, sortOrder, loadedDateFilter, deliveredDateFilter]);

  // Una tabla sin paginar de hasta 500 filas (el tope del alta masiva) no es
  // escaneable. 50 por página; cualquier cambio de filtro vuelve a la 1.
  const PAGE_SIZE = 50;
  const totalPages = Math.max(1, Math.ceil(visibleCodes.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pagedCodes = visibleCodes.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  /** Cualquier cambio de filtro invalida la página actual — mismo `setState`, sin efecto aparte. */
  function updateFilter<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(0);
    };
  }

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
    if (!window.confirm(`¿Eliminar este código? Solo funciona si sigue ${STATUS_LABEL.AVAILABLE}.`)) return;
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

      <div className={shared.filterForm}>
        <input
          type="search"
          value={search}
          onChange={(e) => updateFilter(setSearch)(e.target.value)}
          placeholder="Buscar fingerprint…"
          aria-label="Buscar por fingerprint"
          style={{ minWidth: 200 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => updateFilter(setStatusFilter)(e.target.value)}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={sortOrder}
          onChange={(e) => updateFilter(setSortOrder)(e.target.value as "desc" | "asc")}
          aria-label="Ordenar por fecha de carga"
        >
          <option value="desc">Más reciente primero</option>
          <option value="asc">Más antiguo primero</option>
        </select>
        <div className={shared.field} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <label htmlFor="loadedDate" className={shared.subtitle} style={{ marginTop: 0 }}>
            Cargado
          </label>
          <input
            id="loadedDate"
            type="date"
            value={loadedDateFilter}
            onChange={(e) => updateFilter(setLoadedDateFilter)(e.target.value)}
          />
        </div>
        <div className={shared.field} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <label htmlFor="deliveredDate" className={shared.subtitle} style={{ marginTop: 0 }}>
            Entregado
          </label>
          <input
            id="deliveredDate"
            type="date"
            value={deliveredDateFilter}
            onChange={(e) => updateFilter(setDeliveredDateFilter)(e.target.value)}
          />
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            className={shared.btnSmall}
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setSortOrder("desc");
              setLoadedDateFilter("");
              setDeliveredDateFilter("");
              setPage(0);
            }}
          >
            Limpiar
          </button>
        )}
        <span className={shared.subtitle}>
          {visibleCodes.length} de {codes.length}
        </span>
      </div>

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
            {pagedCodes.map((c) => {
              const isOwner = !c.uploadedById || c.uploadedById === currentUserId;
              const canReveal = canEdit && isOwner && c.status === "AVAILABLE";
              return (
              <tr key={c.id}>
                <td className={shared.mono}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {c.orderId ? (
                      <Link
                        href={`/admin/pedidos/${c.orderId}`}
                        title={c.orderNumber ? `Ver factura del pedido #${c.orderNumber}` : "Ver pedido"}
                        style={{ textDecoration: "underline", textUnderlineOffset: 2 }}
                      >
                        {revealed[c.id] ?? c.fingerprint}
                      </Link>
                    ) : (
                      <span>{revealed[c.id] ?? c.fingerprint}</span>
                    )}
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
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </td>
                <td>{c.uploadedByName ?? "—"}</td>
                <td className={shared.mono}>{formatDateTime(c.createdAt)}</td>
                <td className={shared.mono}>{c.deliveredAt ? formatDateTime(c.deliveredAt) : "—"}</td>
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
                            placeholder="Reemplazar por…"
                            style={{ fontSize: 12, padding: "4px 6px" }}
                          />
                          <button
                            type="button"
                            className={shared.btnSmall}
                            onClick={() => saveEdit(c.id)}
                            disabled={!editValue.trim()}
                          >
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
            {visibleCodes.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className={shared.empty}>
                  {codes.length === 0 ? "Sin códigos cargados." : "Ningún código coincide con el filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={shared.actions} style={{ alignItems: "center" }}>
          <button
            type="button"
            className={shared.btnSmall}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
          >
            ← Anterior
          </button>
          <span className={shared.subtitle}>
            Página {currentPage + 1} de {totalPages}
          </span>
          <button
            type="button"
            className={shared.btnSmall}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

interface Product {
  id: string;
  denomination: string;
  unit: string;
  description: string | null;
  priceCop: number;
  maxPerOrder: number;
  lowStockAt: number;
  isActive: boolean;
}

export function ProductEditForm({ product, canEdit }: { product: Product; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOk(false);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const body = {
      denomination: String(form.get("denomination") ?? "").trim(),
      unit: String(form.get("unit") ?? "").trim(),
      description: String(form.get("description") ?? "").trim() || null,
      priceCop: Number(form.get("priceCop")),
      maxPerOrder: Number(form.get("maxPerOrder")),
      lowStockAt: Number(form.get("lowStockAt")),
    };

    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      setOk(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive() {
    setTogglingActive(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${product.id}/toggle-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !product.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cambiar el estado");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setTogglingActive(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div className={shared.formMsg} data-tone="bad">{error}</div>}
      {ok && <div className={shared.formMsg} data-tone="good">Guardado.</div>}
      <fieldset disabled={!canEdit} style={{ border: "none", padding: 0, margin: 0, display: "contents" }}>
        <div className={shared.formGrid}>
          <div className={shared.field}>
            <label htmlFor="denomination">Denominación</label>
            <input id="denomination" name="denomination" defaultValue={product.denomination} required />
          </div>
          <div className={shared.field}>
            <label htmlFor="unit">Unidad</label>
            <input id="unit" name="unit" defaultValue={product.unit} required />
          </div>
          <div className={shared.field}>
            <label htmlFor="priceCop">Precio (COP)</label>
            <input id="priceCop" name="priceCop" type="number" min={1} defaultValue={product.priceCop} required />
          </div>
          <div className={shared.field}>
            <label htmlFor="maxPerOrder">Máximo por pedido</label>
            <input id="maxPerOrder" name="maxPerOrder" type="number" min={1} defaultValue={product.maxPerOrder} required />
          </div>
          <div className={shared.field}>
            <label htmlFor="lowStockAt">Umbral de stock bajo</label>
            <input id="lowStockAt" name="lowStockAt" type="number" min={0} defaultValue={product.lowStockAt} required />
          </div>
        </div>
        <div className={shared.field}>
          <label htmlFor="description">Descripción</label>
          <textarea id="description" name="description" defaultValue={product.description ?? ""} />
        </div>
      </fieldset>

      {canEdit && (
        <div className={shared.actions}>
          <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallPrimary}`} disabled={submitting}>
            {submitting ? "Guardando…" : "Guardar cambios"}
          </button>
          <button
            type="button"
            onClick={toggleActive}
            className={`${shared.btnSmall} ${product.isActive ? shared.btnSmallDanger : ""}`}
            disabled={togglingActive}
          >
            {togglingActive ? "…" : product.isActive ? "Desactivar producto" : "Activar producto"}
          </button>
        </div>
      )}
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";
import { GAMES, PRODUCTS } from "@/lib/products";

export interface AdminDiscount {
  id: string;
  code: string | null;
  kind: string;
  value: number;
  scope: string;
  scopeRef: string | null;
  minSubtotalCop: number;
  maxUses: number | null;
  usesCount: number;
  stackable: boolean;
  isActive: boolean;
}

export function DiscountsManager({ initialDiscounts, canEdit }: { initialDiscounts: AdminDiscount[]; canEdit: boolean }) {
  const router = useRouter();
  const [discounts, setDiscounts] = useState(initialDiscounts);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<"ORDER" | "GAME" | "PRODUCT">("ORDER");

  async function refresh() {
    const res = await fetch("/api/admin/discounts");
    const data = await res.json();
    if (res.ok) setDiscounts(data.discounts);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreating(true);
    // Capturado ANTES del await: `event.currentTarget` queda `null` en cuanto el handler
    // sincrónico termina (evento de React, no una referencia DOM persistente) — usarlo
    // después de un `await fetch(...)` revienta con "Cannot read properties of null".
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const code = String(form.get("code") ?? "").trim();
    const scopeRef = String(form.get("scopeRef") ?? "").trim();
    const maxUses = String(form.get("maxUses") ?? "").trim();
    const maxUsesPerUser = String(form.get("maxUsesPerUser") ?? "").trim();

    const body = {
      code: code || undefined,
      kind: String(form.get("kind")),
      value: Number(form.get("value")),
      scope: String(form.get("scope")),
      scopeRef: scopeRef || undefined,
      minSubtotalCop: Number(form.get("minSubtotalCop") || 0),
      maxUses: maxUses ? Number(maxUses) : undefined,
      maxUsesPerUser: maxUsesPerUser ? Number(maxUsesPerUser) : undefined,
      stackable: form.get("stackable") === "on",
    };

    try {
      const res = await fetch("/api/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear el descuento");
      formEl.reset();
      setScope("ORDER");
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/discounts/${id}/toggle-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cambiar el estado");
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div className={shared.formMsg} data-tone="bad">{error}</div>}

      <div className={shared.tableWrap}>
        <table className={shared.table}>
          <thead>
            <tr>
              <th>Código</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Alcance</th>
              <th>Usos</th>
              <th>Apilable</th>
              <th>Estado</th>
              {canEdit && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {discounts.map((d) => (
              <tr key={d.id}>
                <td className={shared.mono}>{d.code ?? "(automático)"}</td>
                <td>{d.kind}</td>
                <td className="num-display">{d.kind === "PERCENT" ? `${d.value}%` : d.value}</td>
                <td>
                  {d.scope}
                  {d.scopeRef ? ` · ${d.scopeRef}` : ""}
                </td>
                <td className="num-display">
                  {d.usesCount}
                  {d.maxUses ? ` / ${d.maxUses}` : ""}
                </td>
                <td>{d.stackable ? "Sí" : "No"}</td>
                <td>
                  <span className={shared.badge} data-tone={d.isActive ? "good" : undefined}>
                    {d.isActive ? "ACTIVO" : "INACTIVO"}
                  </span>
                </td>
                {canEdit && (
                  <td>
                    <button type="button" className={shared.btnSmall} onClick={() => toggleActive(d.id, d.isActive)}>
                      {d.isActive ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {discounts.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 8 : 7} className={shared.empty}>
                  Sin descuentos configurados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form onSubmit={handleCreate} className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className={shared.formGrid}>
            <div className={shared.field}>
              <label htmlFor="d-code">Código (vacío = automático, sin cupón)</label>
              <input id="d-code" name="code" placeholder="BIENVENIDA10" />
            </div>
            <div className={shared.field}>
              <label htmlFor="d-kind">Tipo</label>
              <select id="d-kind" name="kind" defaultValue="PERCENT">
                <option value="PERCENT">Porcentaje</option>
                <option value="FIXED">Monto fijo (COP)</option>
              </select>
            </div>
            <div className={shared.field}>
              <label htmlFor="d-value">Valor</label>
              <input id="d-value" name="value" type="number" min={0.01} step="0.01" required />
            </div>
            <div className={shared.field}>
              <label htmlFor="d-scope">Alcance</label>
              <select
                id="d-scope"
                name="scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as "ORDER" | "GAME" | "PRODUCT")}
              >
                <option value="ORDER">Todo el pedido</option>
                <option value="GAME">Un juego</option>
                <option value="PRODUCT">Un producto</option>
              </select>
            </div>
            {scope !== "ORDER" && (
              <div className={shared.field}>
                <label htmlFor="d-scopeRef">{scope === "GAME" ? "Juego" : "Producto"}</label>
                {scope === "GAME" ? (
                  <select id="d-scopeRef" name="scopeRef" required defaultValue="">
                    <option value="" disabled>
                      Elegí un juego…
                    </option>
                    {GAMES.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label} · {g.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select id="d-scopeRef" name="scopeRef" required defaultValue="">
                    <option value="" disabled>
                      Elegí un producto…
                    </option>
                    {PRODUCTS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.gameLabel} · {p.denomination} {p.unit} · {p.id}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <div className={shared.field}>
              <label htmlFor="d-minSubtotalCop">Subtotal mínimo (COP)</label>
              <input id="d-minSubtotalCop" name="minSubtotalCop" type="number" min={0} defaultValue={0} />
            </div>
            <div className={shared.field}>
              <label htmlFor="d-maxUses">Máximo de usos totales</label>
              <input id="d-maxUses" name="maxUses" type="number" min={1} />
            </div>
            <div className={shared.field}>
              <label htmlFor="d-maxUsesPerUser">Máximo por usuario</label>
              <input id="d-maxUsesPerUser" name="maxUsesPerUser" type="number" min={1} />
            </div>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" name="stackable" /> Apilable con otros descuentos
          </label>
          <div className={shared.actions}>
            <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallPrimary}`} disabled={creating}>
              {creating ? "Creando…" : "Crear descuento"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

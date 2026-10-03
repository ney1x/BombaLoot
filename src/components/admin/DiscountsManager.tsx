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
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  usesCount: number;
  maxUsesPerUser: number | null;
  stackable: boolean;
  isActive: boolean;
}

function fieldErrorText(data: { error?: string; fields?: Record<string, string[]> }, fallback: string): string {
  const fieldMsgs = data.fields ? Object.values(data.fields).flat().join(" ") : "";
  return [data.error, fieldMsgs].filter(Boolean).join(" — ") || fallback;
}

/** `<input type="datetime-local">` no admite ISO con `Z`/offset — hay que recortarlo a los 16 primeros chars locales. */
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function scopeLabel(scope: string, scopeRef: string | null): string {
  if (scope === "ORDER") return "Todo el pedido";
  if (scope === "GAME") return `Juego · ${GAMES.find((g) => g.id === scopeRef)?.label ?? scopeRef}`;
  if (scope === "PRODUCT") {
    const p = PRODUCTS.find((p) => p.id === scopeRef);
    return p ? `Producto · ${p.gameLabel} ${p.denomination} ${p.unit}` : `Producto · ${scopeRef}`;
  }
  return scope;
}

export function DiscountsManager({ initialDiscounts, canEdit }: { initialDiscounts: AdminDiscount[]; canEdit: boolean }) {
  const router = useRouter();
  const [discounts, setDiscounts] = useState(initialDiscounts);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<"ORDER" | "GAME" | "PRODUCT">("ORDER");
  const [maxUsesInput, setMaxUsesInput] = useState("");
  const [stackableInput, setStackableInput] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<{ form: FormData; formEl: HTMLFormElement } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const unlimitedExposure = maxUsesInput.trim() === "" && stackableInput;

  async function refresh() {
    const res = await fetch("/api/admin/discounts");
    const data = await res.json();
    if (res.ok) setDiscounts(data.discounts);
  }

  async function submitCreate(form: FormData, formEl: HTMLFormElement) {
    const code = String(form.get("code") ?? "").trim();
    const scopeRef = String(form.get("scopeRef") ?? "").trim();
    const maxUses = String(form.get("maxUses") ?? "").trim();
    const maxUsesPerUser = String(form.get("maxUsesPerUser") ?? "").trim();
    const startsAt = String(form.get("startsAt") ?? "").trim();
    const endsAt = String(form.get("endsAt") ?? "").trim();

    const body = {
      code: code || undefined,
      kind: String(form.get("kind")),
      value: Number(form.get("value")),
      scope: String(form.get("scope")),
      scopeRef: scopeRef || undefined,
      minSubtotalCop: Number(form.get("minSubtotalCop") || 0),
      startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
      endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
      maxUses: maxUses ? Number(maxUses) : undefined,
      maxUsesPerUser: maxUsesPerUser ? Number(maxUsesPerUser) : undefined,
      stackable: form.get("stackable") === "on",
    };

    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(fieldErrorText(data, "No se pudo crear el descuento"));
      formEl.reset();
      setScope("ORDER");
      setMaxUsesInput("");
      setStackableInput(false);
      setPendingCreate(null);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setCreating(false);
    }
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    // Capturado ANTES del await: `event.currentTarget` queda `null` en cuanto el handler
    // sincrónico termina (evento de React, no una referencia DOM persistente) — usarlo
    // después de un `await fetch(...)` revienta con "Cannot read properties of null".
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    if (unlimitedExposure) {
      setPendingCreate({ form, formEl });
      return;
    }
    void submitCreate(form, formEl);
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>, d: AdminDiscount) {
    event.preventDefault();
    setError(null);
    setSavingEdit(true);
    const form = new FormData(event.currentTarget);
    const maxUses = String(form.get("maxUses") ?? "").trim();
    const maxUsesPerUser = String(form.get("maxUsesPerUser") ?? "").trim();
    const startsAt = String(form.get("startsAt") ?? "").trim();
    const endsAt = String(form.get("endsAt") ?? "").trim();
    const body = {
      value: Number(form.get("value")),
      minSubtotalCop: Number(form.get("minSubtotalCop") || 0),
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      maxUses: maxUses ? Number(maxUses) : null,
      maxUsesPerUser: maxUsesPerUser ? Number(maxUsesPerUser) : null,
      stackable: form.get("stackable") === "on",
    };
    try {
      const res = await fetch(`/api/admin/discounts/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(fieldErrorText(data, "No se pudo guardar el descuento"));
      setEditingId(null);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSavingEdit(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    setTogglingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/discounts/${id}/toggle-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(fieldErrorText(data, "No se pudo cambiar el estado"));
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setTogglingId(null);
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
              <th>Vigencia</th>
              <th>Usos</th>
              <th>Apilable</th>
              <th>Estado</th>
              {canEdit && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {discounts.map((d) =>
              editingId === d.id ? (
                <tr key={d.id}>
                  <td colSpan={canEdit ? 9 : 8}>
                    <form
                      onSubmit={(e) => void handleEditSubmit(e, d)}
                      style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}
                    >
                      <div className={shared.formGrid}>
                        <div className={shared.field}>
                          <label htmlFor={`edit-value-${d.id}`}>Valor</label>
                          <input
                            id={`edit-value-${d.id}`}
                            name="value"
                            type="number"
                            min={0.01}
                            step="0.01"
                            defaultValue={d.value}
                            required
                          />
                        </div>
                        <div className={shared.field}>
                          <label htmlFor={`edit-min-${d.id}`}>Subtotal mínimo (COP)</label>
                          <input
                            id={`edit-min-${d.id}`}
                            name="minSubtotalCop"
                            type="number"
                            min={0}
                            defaultValue={d.minSubtotalCop}
                          />
                        </div>
                        <div className={shared.field}>
                          <label htmlFor={`edit-starts-${d.id}`}>Empieza</label>
                          <input
                            id={`edit-starts-${d.id}`}
                            name="startsAt"
                            type="datetime-local"
                            defaultValue={toDatetimeLocalValue(d.startsAt)}
                          />
                        </div>
                        <div className={shared.field}>
                          <label htmlFor={`edit-ends-${d.id}`}>Termina</label>
                          <input
                            id={`edit-ends-${d.id}`}
                            name="endsAt"
                            type="datetime-local"
                            defaultValue={toDatetimeLocalValue(d.endsAt)}
                          />
                        </div>
                        <div className={shared.field}>
                          <label htmlFor={`edit-maxuses-${d.id}`}>Máximo de usos totales</label>
                          <input
                            id={`edit-maxuses-${d.id}`}
                            name="maxUses"
                            type="number"
                            min={d.usesCount || 1}
                            defaultValue={d.maxUses ?? ""}
                          />
                        </div>
                        <div className={shared.field}>
                          <label htmlFor={`edit-maxuser-${d.id}`}>Máximo por usuario</label>
                          <input
                            id={`edit-maxuser-${d.id}`}
                            name="maxUsesPerUser"
                            type="number"
                            min={1}
                            defaultValue={d.maxUsesPerUser ?? ""}
                          />
                        </div>
                      </div>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                        <input type="checkbox" name="stackable" defaultChecked={d.stackable} /> Apilable con
                        descuento de fidelización
                      </label>
                      <div className={shared.actions}>
                        <button
                          type="submit"
                          className={`${shared.btnSmall} ${shared.btnSmallPrimary}`}
                          disabled={savingEdit}
                        >
                          {savingEdit ? "Guardando…" : "Guardar"}
                        </button>
                        <button type="button" className={shared.btnSmall} onClick={() => setEditingId(null)}>
                          Cancelar
                        </button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={d.id}>
                  <td className={shared.mono}>{d.code ?? "(automático)"}</td>
                  <td>{d.kind}</td>
                  <td className="num-display">{d.kind === "PERCENT" ? `${d.value}%` : d.value}</td>
                  <td>{scopeLabel(d.scope, d.scopeRef)}</td>
                  <td className={shared.subtitle} style={{ fontSize: 12 }}>
                    {d.startsAt || d.endsAt ? (
                      <>
                        {d.startsAt ? new Date(d.startsAt).toLocaleString("es-CO") : "sin inicio"}
                        {" → "}
                        {d.endsAt ? new Date(d.endsAt).toLocaleString("es-CO") : "sin fin"}
                      </>
                    ) : (
                      "sin límite"
                    )}
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
                      <div className={shared.actions}>
                        <button type="button" className={shared.btnSmall} onClick={() => setEditingId(d.id)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className={d.isActive ? `${shared.btnSmall} ${shared.btnSmallDanger}` : shared.btnSmall}
                          disabled={togglingId === d.id}
                          onClick={() => void toggleActive(d.id, d.isActive)}
                        >
                          {d.isActive ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ),
            )}
            {discounts.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 9 : 8} className={shared.empty}>
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
              <label htmlFor="d-startsAt">Empieza (vacío = ya activo)</label>
              <input id="d-startsAt" name="startsAt" type="datetime-local" />
            </div>
            <div className={shared.field}>
              <label htmlFor="d-endsAt">Termina (vacío = sin fecha límite)</label>
              <input id="d-endsAt" name="endsAt" type="datetime-local" />
            </div>
            <div className={shared.field}>
              <label htmlFor="d-maxUses">Máximo de usos totales</label>
              <input
                id="d-maxUses"
                name="maxUses"
                type="number"
                min={1}
                value={maxUsesInput}
                onChange={(e) => setMaxUsesInput(e.target.value)}
              />
            </div>
            <div className={shared.field}>
              <label htmlFor="d-maxUsesPerUser">Máximo por usuario</label>
              <input id="d-maxUsesPerUser" name="maxUsesPerUser" type="number" min={1} />
            </div>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input
              type="checkbox"
              name="stackable"
              checked={stackableInput}
              onChange={(e) => setStackableInput(e.target.checked)}
            />{" "}
            Apilable con descuento de fidelización (no con otro cupón — solo un código por pedido)
          </label>

          {pendingCreate ? (
            <div className={shared.formMsg} data-tone="bad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span>
                Sin &quot;Máximo de usos totales&quot; y apilable con fidelización: cualquiera puede usar este código las
                veces que quiera, sumado al descuento de nivel. Exposición económica sin techo. ¿Confirmás igual?
              </span>
              <div className={shared.actions}>
                <button
                  type="button"
                  className={`${shared.btnSmall} ${shared.btnSmallDanger}`}
                  disabled={creating}
                  onClick={() => void submitCreate(pendingCreate.form, pendingCreate.formEl)}
                >
                  {creating ? "Creando…" : "Crear igual"}
                </button>
                <button type="button" className={shared.btnSmall} onClick={() => setPendingCreate(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className={shared.actions}>
              <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallPrimary}`} disabled={creating}>
                {creating ? "Creando…" : "Crear descuento"}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

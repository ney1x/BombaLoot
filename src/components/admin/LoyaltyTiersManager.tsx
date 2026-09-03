"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

export interface AdminTier {
  id: string;
  name: string;
  minPurchases: number;
  discountPct: number;
  sortOrder: number;
  isActive: boolean;
  /** Solo tiene efecto mientras este sea el nivel activo de compras mínimas más alto — ver columna "Nivel actual" en la tabla. */
  repeatEveryPurchases: number | null;
}

function fieldErrorText(data: { error?: string; fields?: Record<string, string[]> }, fallback: string): string {
  const fieldMsgs = data.fields ? Object.values(data.fields).flat().join(" ") : "";
  return [data.error, fieldMsgs].filter(Boolean).join(" — ") || fallback;
}

export function LoyaltyTiersManager({
  initialTiers,
  canEdit,
  customerCounts,
}: {
  initialTiers: AdminTier[];
  canEdit: boolean;
  customerCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [tiers, setTiers] = useState(initialTiers);
  const [counts, setCounts] = useState(customerCounts);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState<AdminTier | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/loyalty-tiers");
    const data = await res.json();
    if (res.ok) setTiers(data.tiers);
    const countsRes = await fetch("/api/admin/loyalty-tiers/customer-counts");
    if (countsRes.ok) setCounts(await countsRes.json().then((d) => d.counts));
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreating(true);
    // Capturado ANTES del await — ver el mismo comentario en DiscountsManager.
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const repeatRaw = String(form.get("repeatEveryPurchases") ?? "").trim();
    const body = {
      id: String(form.get("id") ?? "").trim(),
      name: String(form.get("name") ?? "").trim(),
      minPurchases: Number(form.get("minPurchases")),
      discountPct: Number(form.get("discountPct")),
      sortOrder: Number(form.get("sortOrder") || tiers.length),
      repeatEveryPurchases: repeatRaw ? Number(repeatRaw) : null,
    };
    try {
      const res = await fetch("/api/admin/loyalty-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(fieldErrorText(data, "No se pudo crear el nivel"));
      formEl.reset();
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setCreating(false);
    }
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>, tierId: string) {
    event.preventDefault();
    setError(null);
    setSavingEdit(true);
    const form = new FormData(event.currentTarget);
    const repeatRaw = String(form.get("repeatEveryPurchases") ?? "").trim();
    const body = {
      name: String(form.get("name") ?? "").trim(),
      minPurchases: Number(form.get("minPurchases")),
      discountPct: Number(form.get("discountPct")),
      sortOrder: Number(form.get("sortOrder")),
      repeatEveryPurchases: repeatRaw ? Number(repeatRaw) : null,
    };
    try {
      const res = await fetch(`/api/admin/loyalty-tiers/${tierId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(fieldErrorText(data, "No se pudo guardar el nivel"));
      setEditingId(null);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSavingEdit(false);
    }
  }

  async function applyToggle(tier: AdminTier) {
    setTogglingId(tier.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/loyalty-tiers/${tier.id}/toggle-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !tier.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(fieldErrorText(data, "No se pudo cambiar el estado"));
      setPendingDeactivate(null);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setTogglingId(null);
    }
  }

  // Único nivel donde "repite cada" hace algo — mismo criterio que
  // `ensureLoyaltyCoupons` en el backend (el activo de compras mínimas más
  // alto). Se lo marcamos al admin para que no cargue el campo en un nivel
  // donde no tiene efecto y se quede esperando que pase algo.
  const topActiveTierId = tiers
    .filter((t) => t.isActive)
    .reduce((top: AdminTier | null, t) => (!top || t.minPurchases > top.minPurchases ? t : top), null)?.id;

  function requestToggle(tier: AdminTier) {
    setError(null);
    // Activar no tiene efecto retroactivo peligroso — solo desactivar (nadie sigue calificando
    // para el nivel, el checkout recalcula el próximo mejor nivel activo) pide confirmación.
    if (tier.isActive) {
      setPendingDeactivate(tier);
    } else {
      void applyToggle(tier);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div className={shared.formMsg} data-tone="bad">{error}</div>}

      {pendingDeactivate && (
        <div className={shared.formMsg} data-tone="bad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span>
            Desactivar <b>{pendingDeactivate.name}</b> saca a{" "}
            <b>{counts[pendingDeactivate.id] ?? 0} cliente(s)</b> de ese nivel — el checkout les va a aplicar el
            próximo mejor nivel activo que les alcance (o ninguno).
          </span>
          <div className={shared.actions}>
            <button
              type="button"
              className={`${shared.btnSmall} ${shared.btnSmallDanger}`}
              disabled={togglingId === pendingDeactivate.id}
              onClick={() => void applyToggle(pendingDeactivate)}
            >
              {togglingId === pendingDeactivate.id ? "Desactivando…" : "Confirmar desactivación"}
            </button>
            <button type="button" className={shared.btnSmall} onClick={() => setPendingDeactivate(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <p className={shared.subtitle}>
        La tabla ordena por precedencia real de nivel (compras mínimas, de mayor a menor) — así decide el sistema en
        qué nivel está cada cliente. &quot;Orden&quot; es solo un campo propio, no cambia esa precedencia. La
        fidelización ya no descuenta sola en cada compra: al cruzar el umbral de un nivel, el cliente gana un cupón
        de un solo uso en su cuenta, que elige cuándo canjear. &quot;Repite cada&quot; solo aplica al nivel activo
        marcado como <b>tope</b> — mientras el cliente siga ahí (no hay nivel más arriba), sigue ganando un cupón más
        cada esa cantidad de compras.
      </p>

      <div className={shared.tableWrap}>
        <table className={shared.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Compras mínimas</th>
              <th>Descuento</th>
              <th>Repite cada</th>
              <th>Orden</th>
              <th>Clientes</th>
              <th>Estado</th>
              {canEdit && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {[...tiers]
              .sort((a, b) => b.minPurchases - a.minPurchases)
              .map((t) =>
              editingId === t.id ? (
                <tr key={t.id}>
                  <td colSpan={canEdit ? 9 : 8}>
                    <form
                      onSubmit={(e) => void handleEditSubmit(e, t.id)}
                      style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}
                    >
                      <div className={shared.formGrid}>
                        <div className={shared.field}>
                          <label htmlFor={`edit-name-${t.id}`}>Nombre</label>
                          <input id={`edit-name-${t.id}`} name="name" defaultValue={t.name} required />
                        </div>
                        <div className={shared.field}>
                          <label htmlFor={`edit-min-${t.id}`}>Compras mínimas</label>
                          <input
                            id={`edit-min-${t.id}`}
                            name="minPurchases"
                            type="number"
                            min={0}
                            defaultValue={t.minPurchases}
                            required
                          />
                        </div>
                        <div className={shared.field}>
                          <label htmlFor={`edit-pct-${t.id}`}>Descuento (%)</label>
                          <input
                            id={`edit-pct-${t.id}`}
                            name="discountPct"
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            defaultValue={t.discountPct}
                            required
                          />
                        </div>
                        <div className={shared.field}>
                          <label htmlFor={`edit-order-${t.id}`}>Orden</label>
                          <input
                            id={`edit-order-${t.id}`}
                            name="sortOrder"
                            type="number"
                            min={0}
                            defaultValue={t.sortOrder}
                            required
                          />
                        </div>
                        <div className={shared.field}>
                          <label htmlFor={`edit-repeat-${t.id}`}>Repite cada (solo si es tope)</label>
                          <input
                            id={`edit-repeat-${t.id}`}
                            name="repeatEveryPurchases"
                            type="number"
                            min={1}
                            placeholder="Sin repetición"
                            defaultValue={t.repeatEveryPurchases ?? ""}
                          />
                        </div>
                      </div>
                      {(counts[t.id] ?? 0) > 0 && (
                        <span className={shared.subtitle}>
                          Afecta a {counts[t.id]} cliente(s) actualmente en este nivel.
                        </span>
                      )}
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
                <tr key={t.id}>
                  <td className={shared.mono}>{t.id}</td>
                  <td>{t.name}</td>
                  <td className="num-display">{t.minPurchases}</td>
                  <td className="num-display">{t.discountPct}%</td>
                  <td className="num-display">
                    {t.repeatEveryPurchases ? `cada ${t.repeatEveryPurchases}` : "—"}
                    {t.repeatEveryPurchases && t.id !== topActiveTierId && (
                      <span className={shared.subtitle}> (sin efecto, no es el tope)</span>
                    )}
                  </td>
                  <td className="num-display">{t.sortOrder}</td>
                  <td className="num-display">{counts[t.id] ?? 0}</td>
                  <td>
                    <span className={shared.badge} data-tone={t.isActive ? "good" : undefined}>
                      {t.isActive ? "ACTIVO" : "INACTIVO"}
                    </span>
                    {t.id === topActiveTierId && (
                      <span className={shared.badge} style={{ marginLeft: 6 }}>
                        TOPE
                      </span>
                    )}
                  </td>
                  {canEdit && (
                    <td>
                      <div className={shared.actions}>
                        <button type="button" className={shared.btnSmall} onClick={() => setEditingId(t.id)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className={t.isActive ? `${shared.btnSmall} ${shared.btnSmallDanger}` : shared.btnSmall}
                          disabled={togglingId === t.id}
                          onClick={() => requestToggle(t)}
                        >
                          {t.isActive ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ),
            )}
            {tiers.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 9 : 8} className={shared.empty}>
                  Sin niveles configurados.
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
              <label htmlFor="tier-id">ID (slug)</label>
              <input id="tier-id" name="id" placeholder="platinum" required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
            </div>
            <div className={shared.field}>
              <label htmlFor="tier-name">Nombre</label>
              <input id="tier-name" name="name" placeholder="Platinum" required />
            </div>
            <div className={shared.field}>
              <label htmlFor="tier-minPurchases">Compras mínimas</label>
              <input id="tier-minPurchases" name="minPurchases" type="number" min={0} required />
            </div>
            <div className={shared.field}>
              <label htmlFor="tier-discountPct">Descuento (%)</label>
              <input id="tier-discountPct" name="discountPct" type="number" min={0} max={100} step="0.01" required />
            </div>
            <div className={shared.field}>
              <label htmlFor="tier-sortOrder">Orden</label>
              <input id="tier-sortOrder" name="sortOrder" type="number" min={0} defaultValue={tiers.length} />
            </div>
            <div className={shared.field}>
              <label htmlFor="tier-repeat">Repite cada (solo si es tope)</label>
              <input id="tier-repeat" name="repeatEveryPurchases" type="number" min={1} placeholder="Sin repetición" />
            </div>
          </div>
          <div className={shared.actions}>
            <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallPrimary}`} disabled={creating}>
              {creating ? "Creando…" : "Crear nivel"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

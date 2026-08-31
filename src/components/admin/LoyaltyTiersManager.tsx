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
}

export function LoyaltyTiersManager({ initialTiers, canEdit }: { initialTiers: AdminTier[]; canEdit: boolean }) {
  const router = useRouter();
  const [tiers, setTiers] = useState(initialTiers);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    const res = await fetch("/api/admin/loyalty-tiers");
    const data = await res.json();
    if (res.ok) setTiers(data.tiers);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreating(true);
    // Capturado ANTES del await — ver el mismo comentario en DiscountsManager.
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const body = {
      id: String(form.get("id") ?? "").trim(),
      name: String(form.get("name") ?? "").trim(),
      minPurchases: Number(form.get("minPurchases")),
      discountPct: Number(form.get("discountPct")),
      sortOrder: Number(form.get("sortOrder") || tiers.length),
    };
    try {
      const res = await fetch("/api/admin/loyalty-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear el nivel");
      formEl.reset();
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(tierId: string, isActive: boolean) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/loyalty-tiers/${tierId}/toggle-active`, {
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
              <th>ID</th>
              <th>Nombre</th>
              <th>Compras mínimas</th>
              <th>Descuento</th>
              <th>Orden</th>
              <th>Estado</th>
              {canEdit && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.id}>
                <td className={shared.mono}>{t.id}</td>
                <td>{t.name}</td>
                <td className="num-display">{t.minPurchases}</td>
                <td className="num-display">{t.discountPct}%</td>
                <td className="num-display">{t.sortOrder}</td>
                <td>
                  <span className={shared.badge} data-tone={t.isActive ? "good" : undefined}>
                    {t.isActive ? "ACTIVO" : "INACTIVO"}
                  </span>
                </td>
                {canEdit && (
                  <td>
                    <button type="button" className={shared.btnSmall} onClick={() => toggleActive(t.id, t.isActive)}>
                      {t.isActive ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {tiers.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className={shared.empty}>
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
              <input id="tier-id" name="id" placeholder="platinum" required pattern="[a-z0-9-]+" />
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

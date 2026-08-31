"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

interface Game {
  id: string;
  label: string;
}

export function ProductCreateForm({ games }: { games: Game[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const body = {
      id: String(form.get("id") ?? "").trim(),
      gameId: String(form.get("gameId") ?? ""),
      denomination: String(form.get("denomination") ?? "").trim(),
      unit: String(form.get("unit") ?? "").trim(),
      description: String(form.get("description") ?? "").trim() || undefined,
      priceCop: Number(form.get("priceCop")),
      maxPerOrder: Number(form.get("maxPerOrder") || 10),
      lowStockAt: Number(form.get("lowStockAt") || 5),
    };

    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear el producto");
      router.push(`/admin/productos/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div className={shared.formMsg} data-tone="bad">{error}</div>}
      <div className={shared.formGrid}>
        <div className={shared.field}>
          <label htmlFor="id">ID (slug único)</label>
          <input id="id" name="id" placeholder="valorant-565" required pattern="[a-z0-9-]+" />
        </div>
        <div className={shared.field}>
          <label htmlFor="gameId">Juego</label>
          <select id="gameId" name="gameId" required>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div className={shared.field}>
          <label htmlFor="denomination">Denominación</label>
          <input id="denomination" name="denomination" placeholder="565" required />
        </div>
        <div className={shared.field}>
          <label htmlFor="unit">Unidad</label>
          <input id="unit" name="unit" placeholder="VP" required />
        </div>
        <div className={shared.field}>
          <label htmlFor="priceCop">Precio (COP)</label>
          <input id="priceCop" name="priceCop" type="number" min={1} required />
        </div>
        <div className={shared.field}>
          <label htmlFor="maxPerOrder">Máximo por pedido</label>
          <input id="maxPerOrder" name="maxPerOrder" type="number" min={1} defaultValue={10} />
        </div>
        <div className={shared.field}>
          <label htmlFor="lowStockAt">Umbral de stock bajo</label>
          <input id="lowStockAt" name="lowStockAt" type="number" min={0} defaultValue={5} />
        </div>
      </div>
      <div className={shared.field}>
        <label htmlFor="description">Descripción</label>
        <textarea id="description" name="description" />
      </div>
      <div className={shared.actions}>
        <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallPrimary}`} disabled={submitting}>
          {submitting ? "Creando…" : "Crear producto"}
        </button>
      </div>
    </form>
  );
}

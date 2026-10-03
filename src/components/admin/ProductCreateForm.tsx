"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

interface Game {
  id: string;
  label: string;
}

/** Convenciones reales de denominación/unidad por juego — para que el placeholder no muestre siempre Valorant sin importar qué juego se eligió. */
const UNIT_HINTS: Record<string, { denomination: string; unit: string }> = {
  valorant: { denomination: "565", unit: "VP" },
  roblox: { denomination: "840", unit: "Robux" },
  league: { denomination: "575", unit: "RP" },
  overwatch: { denomination: "500", unit: "de saldo" },
};
const DEFAULT_HINT = { denomination: "565", unit: "VP" };

export function ProductCreateForm({ games }: { games: Game[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [gameId, setGameId] = useState(games[0]?.id ?? "");

  const hint = UNIT_HINTS[gameId] ?? DEFAULT_HINT;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors(null);
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
      isActive: form.get("isActive") === "on",
    };

    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.fields) setFieldErrors(data.fields);
        throw new Error(data.error ?? "No se pudo crear el producto");
      }
      router.push(`/admin/productos/${body.id}?created=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && (
        <div className={shared.formMsg} data-tone="bad">
          {error}
          {fieldErrors && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {Object.entries(fieldErrors).map(([field, messages]) => (
                <li key={field}>{messages.join(" ")}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className={shared.formGrid}>
        <div className={shared.field}>
          <label htmlFor="id">ID (slug único)</label>
          <input id="id" name="id" placeholder={`${gameId}-${hint.denomination}`} required pattern="[a-z0-9-]+" />
        </div>
        <div className={shared.field}>
          <label htmlFor="gameId">Juego</label>
          <select id="gameId" name="gameId" required value={gameId} onChange={(e) => setGameId(e.target.value)}>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div className={shared.field}>
          <label htmlFor="denomination">Denominación</label>
          <input id="denomination" name="denomination" placeholder={hint.denomination} required />
        </div>
        <div className={shared.field}>
          <label htmlFor="unit">Unidad</label>
          <input id="unit" name="unit" placeholder={hint.unit} required />
        </div>
        <div className={shared.field}>
          <label htmlFor="priceCop">Precio (COP)</label>
          <input id="priceCop" name="priceCop" type="number" min={1} max={100_000_000} required />
        </div>
        <div className={shared.field}>
          <label htmlFor="maxPerOrder">Máximo por pedido</label>
          <input id="maxPerOrder" name="maxPerOrder" type="number" min={1} max={1000} defaultValue={10} />
        </div>
        <div className={shared.field}>
          <label htmlFor="lowStockAt">Umbral de stock bajo</label>
          <input id="lowStockAt" name="lowStockAt" type="number" min={0} max={1000} defaultValue={5} />
        </div>
      </div>
      <div className={shared.field}>
        <label htmlFor="description">Descripción</label>
        <textarea id="description" name="description" maxLength={2000} />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" name="isActive" />
        Publicar de inmediato (visible en la tienda ni bien se crea)
      </label>
      {/* Sin tildar: el producto queda como borrador — recién visible en /catalogo cuando el admin
          lo active a mano, después de cargarle códigos e imágenes. Evita que un producto vacío
          aparezca "agotado" en la tienda mientras todavía se está armando (verificado en vivo). */}
      <div className={shared.actions}>
        <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallPrimary}`} disabled={submitting}>
          {submitting ? "Creando…" : "Crear producto"}
        </button>
      </div>
    </form>
  );
}

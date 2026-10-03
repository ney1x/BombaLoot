"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

export interface HeroOrderProduct {
  id: string;
  gameLabel: string;
  denomination: string;
  unit: string;
}

export function HeroOrderManager({ initialProducts }: { initialProducts: HeroOrderProduct[] }) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= products.length) return;

    const previous = products;
    const next = [...products];
    [next[index], next[target]] = [next[target], next[index]];
    setProducts(next);
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/products/hero-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: next.map((p) => p.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el orden");
      router.refresh();
    } catch (err) {
      setProducts(previous);
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <h2 className={shared.title} style={{ fontSize: 15, margin: 0 }}>
          Orden de rotación en Home
        </h2>
        <p className={shared.subtitle}>
          En qué secuencia rota el hero grande. No afecta el catálogo ni &quot;Denominaciones disponibles&quot;
          — esas dos siguen ordenadas por juego y precio.
        </p>
      </div>
      {error && (
        <div className={shared.formMsg} data-tone="bad">
          {error}
        </div>
      )}
      {products.length === 0 && <p className={shared.subtitle}>No hay productos activos para rotar.</p>}
      <ol style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
        {products.map((p, i) => (
          <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={shared.mono} style={{ width: 22, textAlign: "right", color: "var(--ink-faint)" }}>
              {i + 1}
            </span>
            <span style={{ flex: 1 }}>
              {p.gameLabel} · {p.denomination} {p.unit}
            </span>
            <button
              type="button"
              className={shared.btnSmall}
              disabled={i === 0 || saving}
              onClick={() => move(i, -1)}
              aria-label={`Subir ${p.gameLabel} ${p.denomination} ${p.unit}`}
            >
              ↑
            </button>
            <button
              type="button"
              className={shared.btnSmall}
              disabled={i === products.length - 1 || saving}
              onClick={() => move(i, 1)}
              aria-label={`Bajar ${p.gameLabel} ${p.denomination} ${p.unit}`}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

"use client";

import { useState } from "react";
import shared from "@/app/admin/shared.module.css";

export interface CodeLifecycleSettingsValue {
  expiryDays: number;
  riskWindowDays: number;
  fairnessGapDays: number;
  updatedAt: string;
  updatedByName: string | null;
}

/**
 * "Preferencias" del título del feature: los 3 números que gobiernan cuándo
 * un código deja de venderse y cuánto pesa la antigüedad frente a la
 * equidad entre admins (ver `inventory.ts` → `claimCodesForProduct`). Solo
 * SUPERADMIN edita — deciden en parte a quién se le vende el stock de
 * quién, así que no los toca quien también compite por ese reparto.
 */
export function CodeLifecycleSettingsForm({
  initial,
  canEdit,
}: {
  initial: CodeLifecycleSettingsValue;
  canEdit: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [expiryDays, setExpiryDays] = useState(String(initial.expiryDays));
  const [riskWindowDays, setRiskWindowDays] = useState(String(initial.riskWindowDays));
  const [fairnessGapDays, setFairnessGapDays] = useState(String(initial.fairnessGapDays));
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/code-lifecycle-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expiryDays: Number(expiryDays),
          riskWindowDays: Number(riskWindowDays),
          fairnessGapDays: Number(fairnessGapDays),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      setSaved(data.settings);
      setResult("Preferencias actualizadas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  const lastUpdated = `Últ. actualización: ${new Date(saved.updatedAt).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}${saved.updatedByName ? ` por ${saved.updatedByName}` : ""}`;

  if (!canEdit) {
    return (
      <div className={shared.card}>
        <p className={shared.subtitle} style={{ marginTop: 0 }}>
          Vigencia y equidad
        </p>
        <p>
          Caducidad: {saved.expiryDays} días · Aviso de vencimiento desde: {saved.riskWindowDays} días · Margen de
          equidad entre admins: {saved.fairnessGapDays} días
        </p>
        <p className={shared.subtitle}>{lastUpdated} · Solo un SUPERADMIN puede editar estos valores.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p className={shared.subtitle} style={{ marginTop: 0 }}>
        Vigencia y equidad
      </p>
      {error && (
        <div className={shared.formMsg} data-tone="bad">
          {error}
        </div>
      )}
      {result && (
        <div className={shared.formMsg} data-tone="good">
          {result}
        </div>
      )}
      <div className={shared.filterForm}>
        <div className={shared.field}>
          <label htmlFor="expiryDays">Caducidad (días)</label>
          <input
            id="expiryDays"
            type="number"
            min={1}
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
            style={{ width: 90 }}
          />
        </div>
        <div className={shared.field}>
          <label htmlFor="riskWindowDays">Aviso de vencimiento desde (días)</label>
          <input
            id="riskWindowDays"
            type="number"
            min={1}
            value={riskWindowDays}
            onChange={(e) => setRiskWindowDays(e.target.value)}
            style={{ width: 90 }}
          />
        </div>
        <div className={shared.field}>
          <label htmlFor="fairnessGapDays">Margen de equidad entre admins (días)</label>
          <input
            id="fairnessGapDays"
            type="number"
            min={1}
            value={fairnessGapDays}
            onChange={(e) => setFairnessGapDays(e.target.value)}
            style={{ width: 90 }}
          />
        </div>
        <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallPrimary}`} disabled={submitting}>
          {submitting ? "Guardando…" : "Guardar"}
        </button>
      </div>
      <p className={shared.subtitle}>{lastUpdated}</p>
    </form>
  );
}

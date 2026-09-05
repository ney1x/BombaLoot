"use client";

import { useState } from "react";
import shared from "@/app/admin/shared.module.css";

export interface PaymentFeeSettingsValue {
  wompiPercentageBp: number;
  wompiFixedCop: number;
  wompiIvaBp: number;
  updatedAt: string;
  updatedByName: string | null;
}

function bpToPercentLabel(bp: number): string {
  return (bp / 100).toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

/**
 * Tarifa para ESTIMAR la comisión de Wompi — a diferencia de PayPal (que
 * manda la comisión exacta en cada captura), Wompi no la expone por API,
 * así que el neto que se ve en el dashboard depende de que estos 3 números
 * coincidan con el plan real pactado. Default = Plan Avanzado publicado por
 * Wompi (2,65% + $700 + IVA 19% sobre la comisión). Solo SUPERADMIN edita.
 */
export function PaymentFeeSettingsForm({
  initial,
  canEdit,
}: {
  initial: PaymentFeeSettingsValue;
  canEdit: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [percentageBp, setPercentageBp] = useState(String(initial.wompiPercentageBp));
  const [fixedCop, setFixedCop] = useState(String(initial.wompiFixedCop));
  const [ivaBp, setIvaBp] = useState(String(initial.wompiIvaBp));
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/payment-fee-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wompiPercentageBp: Number(percentageBp),
          wompiFixedCop: Number(fixedCop),
          wompiIvaBp: Number(ivaBp),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      setSaved(data.settings);
      setResult("Tarifa actualizada.");
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

  const summary = `${bpToPercentLabel(saved.wompiPercentageBp)}% + $${saved.wompiFixedCop.toLocaleString("es-CO")} + IVA ${bpToPercentLabel(saved.wompiIvaBp)}% sobre la comisión`;

  if (!canEdit) {
    return (
      <div className={shared.card}>
        <p className={shared.subtitle} style={{ marginTop: 0 }}>
          Tarifa de Wompi (estimada)
        </p>
        <p>{summary}</p>
        <p className={shared.subtitle}>{lastUpdated} · Solo un SUPERADMIN puede editar estos valores.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p className={shared.subtitle} style={{ marginTop: 0 }}>
        Tarifa de Wompi (estimada) — {summary}
      </p>
      <p className={shared.subtitle}>
        Wompi no manda la comisión real por API (PayPal sí) — este cálculo es un estimado según la tarifa que
        tengas pactada. Ajustalo si tu plan real es distinto.
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
          <label htmlFor="wompiPercentageBp">% (en puntos básicos, 265 = 2,65%)</label>
          <input
            id="wompiPercentageBp"
            type="number"
            min={0}
            value={percentageBp}
            onChange={(e) => setPercentageBp(e.target.value)}
            style={{ width: 100 }}
          />
        </div>
        <div className={shared.field}>
          <label htmlFor="wompiFixedCop">Fijo (COP)</label>
          <input
            id="wompiFixedCop"
            type="number"
            min={0}
            value={fixedCop}
            onChange={(e) => setFixedCop(e.target.value)}
            style={{ width: 100 }}
          />
        </div>
        <div className={shared.field}>
          <label htmlFor="wompiIvaBp">IVA sobre la comisión (bp, 1900 = 19%)</label>
          <input
            id="wompiIvaBp"
            type="number"
            min={0}
            value={ivaBp}
            onChange={(e) => setIvaBp(e.target.value)}
            style={{ width: 100 }}
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

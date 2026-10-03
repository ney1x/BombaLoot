"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import shared from "@/app/admin/shared.module.css";

const METHOD_LABEL: Record<string, string> = {
  nequi: "Nequi",
  bancolombia: "Bancolombia",
  efectivo: "Efectivo",
  otro: "Otro",
};

/**
 * Registra una transferencia ya hecha por fuera a un admin — no mueve plata,
 * solo baja su "pendiente" en la tabla de ventas por admin. Monto negativo =
 * ajuste para corregir un registro equivocado (la tabla es solo inserción).
 */
export function AdminPayoutForm({ admins }: { admins: { id: string; label: string; pendingCop: number }[] }) {
  const router = useRouter();
  const [adminId, setAdminId] = useState(admins[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("nequi");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId, amountCop: Number(amount), method, reference, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo registrar");
      setAmount("");
      setReference("");
      setNote("");
      setResult("Pago registrado.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  if (admins.length === 0) return null;

  const pending = Math.max(0, Math.round(admins.find((a) => a.id === adminId)?.pendingCop ?? 0));

  return (
    <form onSubmit={handleSubmit} className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p className={shared.subtitle} style={{ marginTop: 0 }}>
        Registrar pago a un admin — anotá la transferencia después de hacerla. Para corregir un error, cargá el
        mismo monto en negativo.
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
          <label htmlFor="payoutAdmin">Admin</label>
          <select id="payoutAdmin" value={adminId} onChange={(e) => setAdminId(e.target.value)}>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className={shared.field}>
          <label htmlFor="payoutAmount">Monto (COP)</label>
          <input
            id="payoutAmount"
            type="number"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={String(pending)}
            style={{ width: 120 }}
          />
        </div>
        <div className={shared.field}>
          <label htmlFor="payoutMethod">Medio</label>
          <select id="payoutMethod" value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(METHOD_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className={shared.field}>
          <label htmlFor="payoutReference">Referencia</label>
          <input id="payoutReference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} />
        </div>
        <div className={shared.field}>
          <label htmlFor="payoutNote">Nota</label>
          <input id="payoutNote" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </div>
        <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallPrimary}`} disabled={submitting}>
          {submitting ? "Guardando…" : "Registrar"}
        </button>
      </div>
    </form>
  );
}

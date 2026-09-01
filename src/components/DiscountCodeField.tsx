"use client";

import { useState } from "react";
import styles from "./DiscountCodeField.module.css";
import { CheckIcon, CloseIcon } from "./icons";

export interface AppliedDiscount {
  code: string;
  amountCop: number;
  stackable: boolean;
}

interface DiscountLineInput {
  productId: string;
  quantity: number;
}

/**
 * Campo de cupón del checkout — antes no existía ningún camino para
 * escribir un código acá, aunque el admin ya podía crear reglas de
 * descuento con cupón desde /admin/descuentos. La vista previa (endpoint
 * de solo lectura, no gasta el uso del cupón) le muestra al comprador el
 * monto antes de confirmar; el canje real y definitivo pasa recién al
 * enviar el pedido en `POST /api/checkout`, dentro de la misma transacción
 * que lo crea.
 */
export function DiscountCodeField({
  lines,
  buyerEmail,
  applied,
  onApplied,
}: {
  lines: DiscountLineInput[];
  buyerEmail: string;
  applied: AppliedDiscount | null;
  onApplied: (discount: AppliedDiscount | null) => void;
}) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    const trimmed = code.trim();
    if (!trimmed || checking) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/discount-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed, lines, buyerEmail: buyerEmail || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Código inválido");
      onApplied({ code: trimmed.toUpperCase(), amountCop: data.discount.amountCop, stackable: data.discount.stackable });
    } catch (err) {
      onApplied(null);
      setError(err instanceof Error ? err.message : "No pudimos validar el código");
    } finally {
      setChecking(false);
    }
  }

  function remove() {
    onApplied(null);
    setCode("");
    setError(null);
  }

  if (applied) {
    return (
      <div className={styles.appliedRow}>
        <span className={styles.appliedBadge}>
          <CheckIcon />
          {applied.code}
        </span>
        <span className={styles.appliedNote}>
          {applied.stackable ? "Se suma a tu descuento por nivel" : "Reemplaza tu descuento por nivel"}
        </span>
        <button type="button" className={styles.removeBtn} onClick={remove} aria-label="Quitar código">
          <CloseIcon />
        </button>
      </div>
    );
  }

  return (
    // `<div>`, no `<form>`: este campo vive DENTRO del <form> del checkout
    // (CheckoutView) — dos <form> anidados es HTML inválido y el submit de
    // acá terminaba enredado con el submit del pedido completo.
    <div className={styles.form}>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        }}
        placeholder="¿Tenés un código de descuento?"
        aria-label="Código de descuento"
        className={styles.input}
      />
      <button type="button" className={styles.applyBtn} onClick={apply} disabled={!code.trim() || checking}>
        {checking ? "Validando…" : "Aplicar"}
      </button>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

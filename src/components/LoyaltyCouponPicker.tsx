"use client";

import { useEffect, useState } from "react";
import styles from "./DiscountCodeField.module.css";
import { CheckIcon, CloseIcon } from "./icons";
import { formatCop } from "@/lib/products";

export interface AvailableLoyaltyCoupon {
  id: string;
  tierName: string;
  discountPct: number;
}

export interface AppliedLoyaltyCoupon {
  id: string;
  label: string;
  amountCop: number;
}

/**
 * A diferencia de `DiscountCodeField`, acá no hay nada que "escribir" ni
 * validar contra el servidor antes de tiempo — el cupón ya es tuyo o no
 * está en la lista. El monto se calcula acá mismo (mismo % que ya se
 * muestra), el canje real y definitivo pasa recién en `POST /api/checkout`,
 * dentro de la misma transacción que crea el pedido — igual que un código
 * escrito.
 */
export function LoyaltyCouponPicker({
  subtotalCop,
  applied,
  onApplied,
  disabled,
  disabledReason,
}: {
  subtotalCop: number;
  applied: AppliedLoyaltyCoupon | null;
  onApplied: (coupon: AppliedLoyaltyCoupon | null) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [coupons, setCoupons] = useState<AvailableLoyaltyCoupon[] | null>(null);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/loyalty-coupons")
      .then((res) => (res.ok ? res.json() : { available: [] }))
      .then((data: { available: AvailableLoyaltyCoupon[] }) => {
        if (!cancelled) setCoupons(data.available);
      })
      .catch(() => {
        if (!cancelled) setCoupons([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!coupons || coupons.length === 0) return null;

  function apply() {
    const coupon = coupons!.find((c) => c.id === selectedId);
    if (!coupon) return;
    const amountCop = Math.round((subtotalCop * coupon.discountPct) / 100);
    onApplied({ id: coupon.id, label: `${coupon.tierName} · ${coupon.discountPct}%`, amountCop });
  }

  function remove() {
    onApplied(null);
    setSelectedId("");
  }

  if (applied) {
    return (
      <div className={styles.appliedRow}>
        <span className={styles.appliedBadge}>
          <CheckIcon />
          {applied.label}
        </span>
        <span className={styles.appliedNote}>Cupón de fidelización — reemplaza tu código de descuento</span>
        <button type="button" className={styles.removeBtn} onClick={remove} aria-label="Quitar cupón de fidelización">
          <CloseIcon />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        aria-label="Cupón de fidelización disponible"
        className={styles.input}
        disabled={disabled}
      >
        <option value="">Tenés {coupons.length} cupón(es) de fidelización — elegí uno</option>
        {coupons.map((c) => (
          <option key={c.id} value={c.id}>
            {c.tierName} · {c.discountPct}% (−{formatCop(Math.round((subtotalCop * c.discountPct) / 100))})
          </option>
        ))}
      </select>
      <button type="button" className={styles.applyBtn} onClick={apply} disabled={disabled || !selectedId}>
        Usar cupón
      </button>
      {disabled && disabledReason && <p className={styles.error}>{disabledReason}</p>}
    </div>
  );
}

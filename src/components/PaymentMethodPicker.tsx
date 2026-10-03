import type { ReactNode } from "react";
import styles from "./PaymentMethodPicker.module.css";
import { CheckIcon } from "./icons";
import { CardMark, NequiMark, PayPalMark, PseMark } from "./PaymentMethodIcons";
import { PAYMENT_METHODS, type PaymentMethodId } from "@/lib/checkout";

const METHOD_ICON: Record<PaymentMethodId, typeof NequiMark> = {
  nequi: NequiMark,
  pse: PseMark,
  card: CardMark,
  paypal: PayPalMark,
};

export function PaymentMethodPicker({
  selected,
  onSelect,
  renderExpansion,
}: {
  selected: PaymentMethodId;
  onSelect: (id: PaymentMethodId) => void;
  /** Contenido propio de un método (hoy: los datos que pide Nequi) — se
   *  inserta pegado debajo de SU tarjeta, no al final de la lista entera. */
  renderExpansion?: (id: PaymentMethodId) => ReactNode;
}) {
  return (
    <div className={styles.grid}>
      {PAYMENT_METHODS.map((method) => {
        const Icon = METHOD_ICON[method.id];
        const active = method.id === selected;
        const expansion = active ? renderExpansion?.(method.id) : null;
        return (
          <div key={method.id}>
            <button
              type="button"
              aria-pressed={active}
              className={`${styles.card} ${active ? styles.active : ""}`}
              onClick={() => onSelect(method.id)}
            >
              <span className={styles.iconWrap}>
                <Icon />
              </span>
              <span className={styles.body}>
                <span className={styles.nameRow}>
                  <span className={styles.name}>{method.name}</span>
                  <span className={styles.region}>{method.region}</span>
                </span>
                <span className={styles.sublabel}>{method.sublabel}</span>
              </span>
              <span className={`${styles.radio} ${active ? styles.radioActive : ""}`}>
                {active && <CheckIcon />}
              </span>
            </button>
            {expansion}
          </div>
        );
      })}
    </div>
  );
}

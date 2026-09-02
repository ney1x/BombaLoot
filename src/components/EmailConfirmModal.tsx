"use client";

import { useEffect } from "react";
import styles from "./EmailConfirmModal.module.css";
import { AlertIcon, MailIcon } from "./icons";

/**
 * Último chequeo antes de mandar el pedido: el código se entrega a este
 * email y, sin cuenta, es la única forma de recuperarlo si algo sale mal —
 * un typo acá (`gmial.com`, autocompletado viejo) es mucho más caro de
 * arreglar después que de confirmar antes.
 */
export function EmailConfirmModal({
  email,
  onConfirm,
  onEdit,
}: {
  email: string;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onEdit();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onEdit]);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="email-confirm-title">
      <div className={styles.card}>
        <span className={styles.icon}>
          <MailIcon />
        </span>
        <h2 id="email-confirm-title">Confirmá tu email</h2>
        <p className={styles.email}>{email}</p>
        <p className={styles.hint}>
          <AlertIcon /> Con este email identificamos tu pedido. Revisá que esté bien escrito antes
          de continuar.
        </p>
        <div className={styles.actions}>
          <button type="button" className="btn btnSecondary" onClick={onEdit}>
            Corregir
          </button>
          <button type="button" className="btn btnPrimary" onClick={onConfirm}>
            Sí, es correcto
          </button>
        </div>
      </div>
    </div>
  );
}

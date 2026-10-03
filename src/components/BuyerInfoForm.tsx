"use client";

import Link from "next/link";
import { useId } from "react";
import styles from "./BuyerInfoForm.module.css";
import { MailIcon } from "./icons";
import type { BuyerInfo } from "@/lib/checkout";
import type { SessionUser } from "@/lib/session-context";
import { tierForPurchases } from "@/lib/user";

export function BuyerInfoForm({
  value,
  onChange,
  sessionUser,
}: {
  value: BuyerInfo;
  onChange: (info: BuyerInfo) => void;
  sessionUser: SessionUser | null;
}) {
  const emailId = useId();
  const nameId = useId();
  const tier = tierForPurchases(sessionUser?.purchasesCount ?? 0);
  const displayName = sessionUser?.name?.trim() || sessionUser?.email || "";

  function switchMode(isGuest: boolean) {
    if (isGuest || !sessionUser) {
      onChange({ name: "", email: "", isGuest: true });
    } else {
      onChange({ name: sessionUser.name ?? "", email: sessionUser.email, isGuest: false });
    }
  }

  return (
    <div>
      <div className={styles.tabs} role="group" aria-label="Tipo de comprador">
        <button
          type="button"
          aria-pressed={value.isGuest}
          className={`${styles.tab} ${value.isGuest ? styles.tabActive : ""}`}
          onClick={() => switchMode(true)}
        >
          Comprar como invitado
        </button>
        <button
          type="button"
          aria-pressed={!value.isGuest}
          className={`${styles.tab} ${!value.isGuest ? styles.tabActive : ""}`}
          onClick={() => switchMode(false)}
          disabled={!sessionUser}
        >
          Ya tengo cuenta
        </button>
      </div>

      {value.isGuest ? (
        <div className={styles.fields}>
          <label className={styles.field} htmlFor={emailId}>
            <span className={styles.label}>Email</span>
            <input
              id={emailId}
              type="email"
              className={styles.input}
              placeholder="tu@email.com"
              autoComplete="email"
              required
              value={value.email}
              onChange={(e) => onChange({ ...value, email: e.target.value })}
            />
          </label>
          <label className={styles.field} htmlFor={nameId}>
            <span className={styles.label}>Nombre (opcional)</span>
            <input
              id={nameId}
              type="text"
              className={styles.input}
              placeholder="¿Cómo te llamamos?"
              autoComplete="name"
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
            />
          </label>
          <p className={styles.hint}>
            <MailIcon /> Vas a recibir la confirmación de compra y tu código en este correo. No
            necesitás crear una cuenta para completar el pedido.
          </p>
          {!sessionUser && (
            <p className={styles.hint}>
              ¿Ya tenés cuenta? <Link href="/cuenta/login">Iniciá sesión</Link> para sumar esta compra a tu historial y tus cupones de fidelización.
            </p>
          )}
        </div>
      ) : (
        <div className={styles.identityCard}>
          <span className={styles.avatar}>{displayName.charAt(0).toUpperCase()}</span>
          <div className={styles.identityBody}>
            <div className={styles.identityName}>{displayName}</div>
            <div className={styles.identityEmail}>{sessionUser?.email}</div>
          </div>
          <span className={styles.tierPill}>{tier.name}</span>
        </div>
      )}
    </div>
  );
}

"use client";

import { useId, useState } from "react";
import styles from "./AuthForm.module.css";
import { EyeIcon, EyeOffIcon } from "./icons";

export function PasswordField({
  label,
  name,
  autoComplete,
}: {
  label: string;
  name?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <label className={styles.field} htmlFor={id}>
      <span className={styles.label}>{label}</span>
      <div className={styles.passwordWrap}>
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          className={styles.input}
          placeholder="••••••••"
          autoComplete={autoComplete}
          required
          minLength={8}
        />
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </label>
  );
}

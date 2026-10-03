"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import styles from "@/components/AuthForm.module.css";
import { AlertIcon, CheckIcon } from "@/components/icons";

export default function RecuperarPage() {
  const [status, setStatus] = useState<"idle" | "submitting" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus("submitting");

    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/auth/password/reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "No pudimos procesar la solicitud. Probá de nuevo.");
        setStatus("idle");
        return;
      }

      // Misma pantalla exista o no la cuenta — el servidor ya responde
      // siempre con el mismo mensaje genérico.
      setStatus("sent");
    } catch {
      setError("No pudimos conectarnos. Probá de nuevo en un momento.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <AuthLayout title="Sumá beneficios con tu cuenta">
        <div className={styles.eyebrow}>Recuperar contraseña</div>
        <h2 className={styles.heading}>Revisá tu correo</h2>
        <p className={styles.formSuccess}>
          <CheckIcon />
          Si existe una cuenta con ese email, te enviamos instrucciones para elegir una
          contraseña nueva. El link vence en 30 minutos.
        </p>
        <Link href="/cuenta/login" className="btn btnSecondary">
          Volver a iniciar sesión
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sumá beneficios con tu cuenta">
      <div className={styles.eyebrow}>Recuperar contraseña</div>
      <h2 className={styles.heading}>¿Olvidaste tu contraseña?</h2>
      <p className={styles.switchLine}>
        Te mandamos un link para elegir una nueva. <Link href="/cuenta/login">Volver</Link>
      </p>

      {error && (
        <p className={styles.formError}>
          <AlertIcon />
          {error}
        </p>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field} htmlFor="recuperar-email">
          <span className={styles.label}>Email</span>
          <input
            id="recuperar-email"
            name="email"
            type="email"
            className={styles.input}
            placeholder="tu@email.com"
            autoComplete="email"
            required
          />
        </label>

        <button type="submit" className="btn btnPrimary" disabled={status === "submitting"}>
          {status === "submitting" ? "Enviando…" : "Enviar instrucciones"}
        </button>
      </form>
    </AuthLayout>
  );
}

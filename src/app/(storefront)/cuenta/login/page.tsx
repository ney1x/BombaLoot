"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { SecureAuthShell } from "@/components/SecureAuthShell";
import { PasswordField } from "@/components/PasswordField";
import styles from "@/components/AuthForm.module.css";
import loginStyles from "./login.module.css";
import { AlertIcon, GoogleIcon } from "@/components/icons";
import { useSession } from "@/lib/session-context";

/** Mensajes para `?error=` — llega acá tras un `/api/auth/google/callback` que no pudo seguir. */
const OAUTH_ERROR_MESSAGE: Record<string, string> = {
  google_failed: "No pudimos completar el inicio de sesión con Google. Probá de nuevo.",
  google_not_configured: "El inicio de sesión con Google todavía no está disponible.",
  account_suspended: "Esta cuenta está suspendida. Contactá a soporte si creés que es un error.",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useSession();
  const [error, setError] = useState<string | null>(
    () => OAUTH_ERROR_MESSAGE[searchParams.get("error") ?? ""] ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const googleHref = `/api/auth/google/start?next=${encodeURIComponent(searchParams.get("next") || "/cuenta")}`;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          remember: form.get("remember") === "on",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "No pudimos iniciar sesión. Probá de nuevo.");
        return;
      }

      setUser(data.user);
      router.push(searchParams.get("next") || "/cuenta");
      router.refresh();
    } catch {
      setError("No pudimos conectarnos. Probá de nuevo en un momento.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SecureAuthShell>
      <h2 className={styles.heading}>Iniciar sesión</h2>

      {error && (
        <p className={styles.formError}>
          <AlertIcon />
          {error}
        </p>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field} htmlFor="login-email">
          <span className={styles.label}>Email</span>
          <input
            id="login-email"
            name="email"
            type="email"
            className={styles.input}
            placeholder="tu@email.com"
            autoComplete="email"
            required
          />
        </label>

        <PasswordField label="Contraseña" name="password" autoComplete="current-password" />

        <div className={styles.row}>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" name="remember" />
            Recordarme
          </label>
          <Link href="/cuenta/recuperar">¿Olvidaste tu contraseña?</Link>
        </div>

        <button
          type="submit"
          className={`btn btnPrimary ${loginStyles.submitButton}`}
          disabled={submitting}
        >
          {submitting ? "Ingresando…" : "Iniciar sesión"}
        </button>
      </form>

      <div className={styles.divider}>o continuá con</div>

      <a href={googleHref} className={styles.socialBtn}>
        <GoogleIcon />
        Continuar con Google
      </a>

      <Link href="/catalogo" className={`btn btnSecondary ${styles.guestBtn}`}>
        Continuar como invitado
      </Link>

      <p className={styles.switchLine}>
        ¿No tenés cuenta todavía? <Link href="/cuenta/registro">Registrate</Link>
      </p>
    </SecureAuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { PasswordField } from "@/components/PasswordField";
import styles from "@/components/AuthForm.module.css";
import { AlertIcon } from "@/components/icons";
import { useSession } from "@/lib/session-context";

export default function RecuperarTokenPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { setUser } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: params.token,
          password: form.get("password"),
          confirmPassword: form.get("confirmPassword"),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "No pudimos actualizar tu contraseña.");
        return;
      }

      // El servidor ya revocó todas las sesiones anteriores y abrió una
      // nueva — se refleja acá para que el Header quede al día.
      await fetch("/api/auth/session", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setUser(d.user))
        .catch(() => {});

      router.push("/cuenta");
      router.refresh();
    } catch {
      setError("No pudimos conectarnos. Probá de nuevo en un momento.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Sumá beneficios con tu cuenta">
      <div className={styles.eyebrow}>Recuperar contraseña</div>
      <h2 className={styles.heading}>Elegí una contraseña nueva</h2>

      {error && (
        <p className={styles.formError}>
          <AlertIcon />
          {error}{" "}
          {error?.toLowerCase().includes("no es válido") && (
            <>
              — <Link href="/cuenta/recuperar">pedí un link nuevo</Link>.
            </>
          )}
        </p>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        <PasswordField label="Contraseña nueva" name="password" autoComplete="new-password" />
        <PasswordField
          label="Confirmar contraseña nueva"
          name="confirmPassword"
          autoComplete="new-password"
        />

        <button type="submit" className="btn btnPrimary" disabled={submitting}>
          {submitting ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    </AuthLayout>
  );
}

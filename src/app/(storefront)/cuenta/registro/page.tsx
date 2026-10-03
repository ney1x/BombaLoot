"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { PasswordField } from "@/components/PasswordField";
import styles from "@/components/AuthForm.module.css";
import { AlertIcon, GoogleIcon } from "@/components/icons";
import { useSession } from "@/lib/session-context";

function RegistroForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Si venimos desde "¿Querés guardar tus compras?" en la pantalla de
  // entrega de un pedido de invitado, ese link trae el token de acceso del
  // pedido. Acá solo se reenvía al completar el registro — el vínculo en sí
  // (POST /api/auth/claim) se hace recién cuando existe una cuenta real.
  const claimToken = searchParams.get("claim");
  const prefillEmail = searchParams.get("email") ?? "";
  const googleHref = `/api/auth/google/start?next=${encodeURIComponent("/cuenta")}${claimToken ? `&claim=${encodeURIComponent(claimToken)}` : ""}`;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          confirmPassword: form.get("confirmPassword"),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "No pudimos crear tu cuenta. Probá de nuevo.");
        return;
      }

      setUser(data.user);

      if (claimToken) {
        // Best-effort: si falla, la cuenta ya quedó creada y logueada
        // igual — el pedido se puede vincular después manualmente.
        await fetch("/api/auth/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: claimToken }),
        }).catch(() => {});
      }

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
      <div className={styles.eyebrow}>Nuevo por acá</div>
      <h2 className={styles.heading}>Crear cuenta</h2>
      <p className={styles.switchLine}>
        ¿Ya tenés cuenta? <Link href="/cuenta/login">Iniciá sesión</Link>
      </p>

      {error && (
        <p className={styles.formError}>
          <AlertIcon />
          {error}
        </p>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field} htmlFor="reg-name">
          <span className={styles.label}>Nombre</span>
          <input
            id="reg-name"
            name="name"
            type="text"
            className={styles.input}
            placeholder="Tu nombre"
            autoComplete="name"
            required
          />
        </label>

        <label className={styles.field} htmlFor="reg-email">
          <span className={styles.label}>Email</span>
          <input
            id="reg-email"
            name="email"
            type="email"
            className={styles.input}
            placeholder="tu@email.com"
            autoComplete="email"
            defaultValue={prefillEmail}
            required
          />
        </label>

        <PasswordField label="Contraseña" name="password" autoComplete="new-password" />
        <PasswordField label="Confirmar contraseña" name="confirmPassword" autoComplete="new-password" />

        <button type="submit" className="btn btnPrimary" disabled={submitting}>
          {submitting ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>

      <div className={styles.divider}>o continuá con</div>

      <a href={googleHref} className={styles.socialBtn}>
        <GoogleIcon />
        Continuar con Google
      </a>

      <p className={styles.note}>
        Al crear tu cuenta vas a poder ver tu historial de compras, acceder a tus pedidos más
        rápido y sumar niveles de fidelización. Nunca es obligatorio para comprar.
      </p>
    </AuthLayout>
  );
}

export default function RegistroPage() {
  return (
    <Suspense fallback={null}>
      <RegistroForm />
    </Suspense>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import accountStyles from "@/app/(storefront)/cuenta/account.module.css";
import styles from "@/app/(storefront)/cuenta/perfil/perfil.module.css";
import formStyles from "@/components/AuthForm.module.css";
import { AccountShell, type AccountShellUser } from "@/components/AccountShell";
import { PasswordField } from "@/components/PasswordField";
import { AlertIcon } from "@/components/icons";
import { useSession } from "@/lib/session-context";

export function PerfilView({ user }: { user: AccountShellUser }) {
  const router = useRouter();
  const { setUser } = useSession();
  const [savedProfile, setSavedProfile] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savedPassword, setSavedPassword] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleteError(null);
    setDeleting(true);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    try {
      const res = await fetch("/api/auth/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.get("deletePassword") }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error ?? "No pudimos eliminar tu cuenta.");
        return;
      }
      setUser(null);
      router.push("/");
      router.refresh();
    } catch {
      setDeleteError("No pudimos conectarnos. Probá de nuevo en un momento.");
    } finally {
      setDeleting(false);
    }
  }

  function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    // No hay endpoint de edición de perfil todavía (fuera del alcance de
    // esta fase) — se mantiene como confirmación visual local, igual que
    // en el mock aprobado.
    setSavedProfile(true);
    setTimeout(() => setSavedProfile(false), 2000);
  }

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setSavingPassword(true);

    // `currentTarget` solo es válido durante el despacho síncrono del
    // evento — después de un `await`, el DOM ya lo devolvió a null. Hay que
    // capturar la referencia al form ANTES de la primera espera asíncrona.
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    try {
      const res = await fetch("/api/auth/password/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.get("currentPassword"),
          newPassword: form.get("newPassword"),
          confirmPassword: form.get("confirmPassword"),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setPasswordError(data.error ?? "No pudimos actualizar tu contraseña.");
        return;
      }

      formEl.reset();
      setSavedPassword(true);
      setTimeout(() => setSavedPassword(false), 2000);
    } catch {
      setPasswordError("No pudimos conectarnos. Probá de nuevo en un momento.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <AccountShell user={user}>
      <div className={accountStyles.pageHead}>
        <h1>Perfil</h1>
        <p>Tus datos y tu contraseña.</p>
      </div>

      <div className={styles.card}>
        <h2>Datos personales</h2>
        <form className={styles.form} onSubmit={saveProfile}>
          <label className={formStyles.field} htmlFor="profile-name">
            <span className={formStyles.label}>Nombre</span>
            <input
              id="profile-name"
              type="text"
              className={formStyles.input}
              defaultValue={user.name ?? ""}
            />
          </label>
          <label className={formStyles.field} htmlFor="profile-email">
            <span className={formStyles.label}>Email</span>
            <input
              id="profile-email"
              type="email"
              className={formStyles.input}
              defaultValue={user.email}
            />
          </label>
          <div className={styles.saveRow}>
            <button type="submit" className="btn btnPrimary">
              Guardar cambios
            </button>
            {savedProfile && <span className={styles.savedNote}>Guardado ✓</span>}
          </div>
        </form>
      </div>

      <div className={styles.card}>
        <h2>Cambiar contraseña</h2>

        {passwordError && (
          <p className={formStyles.formError}>
            <AlertIcon />
            {passwordError}
          </p>
        )}

        <form className={styles.form} onSubmit={savePassword}>
          <PasswordField label="Contraseña actual" name="currentPassword" autoComplete="current-password" />
          <PasswordField label="Contraseña nueva" name="newPassword" autoComplete="new-password" />
          <PasswordField
            label="Confirmar contraseña nueva"
            name="confirmPassword"
            autoComplete="new-password"
          />
          <div className={styles.saveRow}>
            <button type="submit" className="btn btnPrimary" disabled={savingPassword}>
              {savingPassword ? "Actualizando…" : "Actualizar contraseña"}
            </button>
            {savedPassword && <span className={styles.savedNote}>Actualizado ✓</span>}
          </div>
        </form>
      </div>

      <div className={styles.card}>
        <h2>Tus datos</h2>
        <p>Descargá una copia de tu perfil, tus pedidos y tus solicitudes de soporte.</p>
        <a href="/api/cuenta/export" className="btn btnSecondary" style={{ marginTop: 12 }}>
          Descargar mis datos
        </a>
      </div>

      <div className={styles.card} style={{ borderColor: "var(--alert)" }}>
        <h2>Eliminar cuenta</h2>
        <p>
          Esto anonimiza tu perfil (nombre, email y contraseña dejan de servir para entrar) y
          cierra todas tus sesiones. Tus pedidos se conservan por obligación legal/contable, pero
          dejan de estar asociados a datos que te identifiquen. Esta acción no se puede deshacer.
        </p>

        {!deleteOpen ? (
          <button type="button" className="btn btnSecondary" style={{ marginTop: 12 }} onClick={() => setDeleteOpen(true)}>
            Eliminar mi cuenta
          </button>
        ) : (
          <form className={styles.form} onSubmit={handleDelete} style={{ marginTop: 12 }}>
            {deleteError && (
              <p className={formStyles.formError}>
                <AlertIcon />
                {deleteError}
              </p>
            )}
            <PasswordField label="Confirmá tu contraseña actual" name="deletePassword" autoComplete="current-password" />
            <div className={styles.saveRow}>
              <button type="submit" className="btn btnPrimary" disabled={deleting}>
                {deleting ? "Eliminando…" : "Confirmar eliminación"}
              </button>
              <button type="button" className="btn btnSecondary" onClick={() => setDeleteOpen(false)}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </AccountShell>
  );
}

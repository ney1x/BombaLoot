"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./ProfileMenu.module.css";
import { ThemeToggle } from "./ThemeToggle";
import { UserIcon } from "./icons";
import { useSession } from "@/lib/session-context";

/**
 * El ícono de perfil ahora abre un panel en vez de ser un link directo —
 * junta login/cuenta/salir CON el switch de tema, que antes vivía como un
 * control suelto en la barra. Menos íconos de primer nivel en el navbar
 * (país, catálogo, carrito, perfil — el pedido explícito), sin perder
 * ningún control, todos quedan adentro de este panel.
 */
export function ProfileMenu() {
  const router = useRouter();
  const { user, setUser } = useSession();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  async function handleLogout() {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user ? `Mi cuenta — ${user.name?.trim() || user.email}` : "Perfil"}
        title={user ? "Mi cuenta" : "Iniciar sesión"}
      >
        <UserIcon />
        {user && <span className={styles.accountDot} aria-hidden="true" />}
      </button>
      {open && (
        <div className={styles.dropdown} role="menu" aria-label="Perfil">
          {user ? (
            <>
              <div className={styles.userInfo}>
                <span className={styles.userName}>{user.name?.trim() || "Tu cuenta"}</span>
                <span className={styles.userEmail}>{user.email}</span>
              </div>
              <Link href="/cuenta" role="menuitem" className={styles.link} onClick={() => setOpen(false)}>
                Mi cuenta
              </Link>
              <button type="button" role="menuitem" className={styles.linkButton} onClick={handleLogout}>
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <Link href="/cuenta/login" role="menuitem" className={styles.link} onClick={() => setOpen(false)}>
                Iniciar sesión
              </Link>
              <Link href="/cuenta/registro" role="menuitem" className={styles.link} onClick={() => setOpen(false)}>
                Crear cuenta
              </Link>
            </>
          )}
          <div className={styles.divider} />
          <div className={styles.themeRow}>
            <span>Modo oscuro</span>
            <ThemeToggle />
          </div>
        </div>
      )}
    </div>
  );
}

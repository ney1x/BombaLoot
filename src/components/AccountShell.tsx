"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./AccountShell.module.css";
import { LogOutIcon } from "./icons";
import { useSession } from "@/lib/session-context";
import { tierForPurchases } from "@/lib/user";

const NAV_ITEMS = [
  { href: "/cuenta", label: "Resumen" },
  { href: "/cuenta/pedidos", label: "Mis compras" },
  { href: "/cuenta/soporte", label: "Mis solicitudes" },
  { href: "/cuenta/fidelizacion", label: "Fidelización" },
  { href: "/cuenta/perfil", label: "Perfil" },
];

export interface AccountShellUser {
  name: string | null;
  email: string;
  purchasesCount: number;
}

/**
 * `user` viene siempre del servidor (cada page.tsx bajo /cuenta llama
 * `requireUser()` y pasa la fila real) — nunca de este componente cliente
 * adivinando quién está logueado. `useSession()` solo se usa para dejar el
 * Header al día después del logout, no para decidir qué mostrar acá.
 */
export function AccountShell({ children, user }: { children: ReactNode; user: AccountShellUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const { setUser } = useSession();
  const tier = tierForPurchases(user.purchasesCount);
  const displayName = user.name?.trim() || user.email;
  const initial = displayName.charAt(0).toUpperCase();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/cuenta/login");
    router.refresh();
  }

  return (
    <main className={styles.main}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.userCard}>
            <span className={styles.avatar}>{initial}</span>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{displayName}</div>
              <div className={styles.userTier}>{tier.name}</div>
            </div>
          </div>

          <nav className={styles.nav}>
            {/*
             * `prefetch={false}`: los 5 tabs son rutas dinámicas (cada una
             * corre `requireUser()` + su propia consulta) — sin esto, CADA
             * página bajo /cuenta dispara los 5 RSC prefetch a la vez apenas
             * carga, mismo patrón medido y confirmado en la home (ver
             * `GameShowcase`/`ProductTile`). Acá pega más seguido: es el
             * shell de TODA la sección de cuenta, no una sola página.
             */}
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={styles.navLink}
                aria-current={pathname === item.href ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <button type="button" className={styles.logout} onClick={handleLogout}>
            <LogOutIcon />
            Cerrar sesión
          </button>
        </aside>

        <div className={styles.content}>{children}</div>
      </div>
    </main>
  );
}

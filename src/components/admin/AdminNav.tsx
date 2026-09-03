"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/app/admin/admin.module.css";

/**
 * Necesita `usePathname()` (cliente) para saber cuál link resaltar — por
 * eso vive separado del layout, que es Server Component. `/admin` matchea
 * exacto (si no, cualquier ruta lo marcaría activo por el `startsWith`);
 * el resto matchea por prefijo para que una subruta (`/admin/productos/123`)
 * siga resaltando su sección en el nav.
 */
export function AdminNav({ items }: { items: { href: string; label: string; badge?: number }[] }) {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      {items.map((item) => {
        const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={styles.navLink}
            data-active={isActive || undefined}
            aria-current={isActive ? "page" : undefined}
          >
            <span>{item.label}</span>
            {!!item.badge && (
              <span className={styles.navBadge} title={`${item.badge} reembolso(s) esperando revisión manual`}>
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

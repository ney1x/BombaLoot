import type { Metadata } from "next";
import { Public_Sans, Roboto_Mono } from "next/font/google";
import "../globals.css";
import styles from "./admin.module.css";
import { requireAdminOrSupport } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { countPendingManualReviews } from "@/server/services/admin-refunds";
import { AdminNav } from "@/components/admin/AdminNav";
import { ThemeInit } from "@/components/admin/ThemeInit";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Root layout propio del panel admin — NO cuelga de `(storefront)/layout.tsx`.
 * `app/admin` no tiene ningún `layout.tsx` por encima en `app/` (el árbol
 * público vive bajo el route group `(storefront)`), así que este layout es
 * un root layout independiente: define su propio `<html>`/`<body>`, carga
 * solo las fuentes que usa (sin `Big_Shoulders`, la tipografía display del
 * storefront — el admin no la necesita) y no monta `Header`, `Footer`,
 * `CartProvider` ni nada del carrito o la navegación de catálogo.
 *
 * Efecto práctico de tener dos root layouts: navegar de una ruta pública a
 * `/admin` (o viceversa) hace un full page load en vez de una transición de
 * cliente — es el trade-off documentado de Next para múltiples root
 * layouts, y es aceptable acá: son dos aplicaciones distintas que
 * comparten tokens visuales, no una sola SPA.
 */

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = { title: "Panel admin — BombaLoot" };

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/juegos", label: "Juegos" },
  { href: "/admin/inventario", label: "Inventario" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/soporte", label: "Soporte" },
  { href: "/admin/reembolsos", label: "Reembolsos" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/seguridad", label: "Seguridad" },
  { href: "/admin/fidelizacion", label: "Fidelización" },
  { href: "/admin/descuentos", label: "Descuentos" },
  { href: "/admin/auditoria", label: "Auditoría" },
  // "Configuración" vivía acá sin página detrás — 404 en cada carga del
  // admin (hallazgo repetido en varias críticas de diseño). Sacado hasta
  // que exista una página real; no inventar una de settings vacía.
];

/**
 * `requireAdminOrSupport()` corre acá arriba, en el layout — así cualquier
 * página nueva bajo `/admin/*` queda protegida por default sin tener que
 * acordarse de repetir el guard en cada `page.tsx`. Rutas que necesiten
 * además ser ADMIN-only (crear producto, refunds) vuelven a chequear con
 * `requireAdmin()`/`requireAdminApi()` en su propio nivel — este guard es
 * el piso mínimo, no el único.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminOrSupport();
  const pendingReviews = await countPendingManualReviews(getDb());
  const navItems = NAV_ITEMS.map((item) =>
    item.href === "/admin/reembolsos" && pendingReviews > 0 ? { ...item, badge: pendingReviews } : item,
  );

  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${publicSans.variable} ${robotoMono.variable}`}
    >
      <body>
        <ThemeInit />
        <div className={styles.shell}>
          <aside className={styles.sidebar}>
            <div className={styles.brand}>
              <span className={styles.brandMark}>BombaLoot</span>
              <span className={styles.brandSub}>admin</span>
            </div>
            <AdminNav items={navItems} />
            <div className={styles.sidebarFoot}>
              <div className={styles.sessionRole} data-role={session.role}>
                {session.role}
              </div>
              <div className={styles.sessionEmail}>{session.email}</div>
            </div>
          </aside>
          <div className={styles.mainColumn}>
            <header className={styles.topbar}>
              <span className={styles.topbarTitle}>Centro de operación</span>
              <ThemeToggle />
            </header>
            <main className={styles.main}>{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}

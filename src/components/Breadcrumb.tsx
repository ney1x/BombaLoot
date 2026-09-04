import Link from "next/link";
import styles from "./Breadcrumb.module.css";
import { breadcrumbJsonLd, type BreadcrumbItem } from "@/lib/seo";

/**
 * Fase 7 — un solo lugar que arma el breadcrumb visible Y el `BreadcrumbList`
 * (JSON-LD) a partir de la MISMA lista de `items`, para que nunca puedan
 * desincronizarse entre sí (antes de esto, `catalogo/[game]/page.tsx` tenía
 * su propio JSON-LD y `GamePurchase.tsx` su propio breadcrumb visible,
 * escritos a mano por separado — exactamente el tipo de duplicación que
 * pidió evitar esta fase).
 *
 * El último item nunca es link — es la página actual, no un lugar al que
 * volver. `breadcrumbJsonLd` (Fase 5, `lib/seo.ts`) ya arma las URLs
 * absolutas contra `APP_URL`, así que acá no hay nada de dominio.
 */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd(items) }}
      />
      <p className={styles.crumb}>
        {items.map((item, index) => (
          <span key={item.path || "home"}>
            {index > 0 && " / "}
            {index === items.length - 1 ? item.name : <Link href={item.path || "/"}>{item.name}</Link>}
          </span>
        ))}
      </p>
    </>
  );
}

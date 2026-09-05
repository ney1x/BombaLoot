import Link from "next/link";
import styles from "./Breadcrumb.module.css";
import { ChevronRightIcon, GAME_MARKS } from "./icons";
import { breadcrumbJsonLd, type BreadcrumbItem } from "@/lib/seo";
import { GAME_COLORS, type GameId } from "@/lib/products";

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
 *
 * `gameId` es opcional — cuando la página es de un juego puntual
 * (`/catalogo/[game]`), el item actual toma el color y la marca de ESE
 * juego (mismos `GAME_COLORS`/`GAME_MARKS` que ya usan `GamePurchase`,
 * `CatalogProductCard`, etc.) en vez de quedar genérico — el breadcrumb se
 * siente parte de la página en la que está.
 */
export function Breadcrumb({ items, gameId }: { items: BreadcrumbItem[]; gameId?: GameId }) {
  const Mark = gameId ? GAME_MARKS[gameId] : null;
  const accent = gameId ? GAME_COLORS[gameId].base : undefined;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd(items) }}
      />
      <nav className={styles.crumb} aria-label="Ruta de navegación">
        <ol className={styles.list}>
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <li key={item.path || "home"} className={styles.item}>
                {index > 0 && <ChevronRightIcon className={styles.separator} aria-hidden="true" />}
                {isLast ? (
                  <span
                    className={`${styles.current} ${accent ? styles.currentAccent : ""}`}
                    style={accent ? { background: `${accent}14`, color: accent } : undefined}
                  >
                    {Mark && <Mark className={styles.mark} aria-hidden="true" />}
                    {item.name}
                  </span>
                ) : (
                  <Link href={item.path || "/"} className={styles.link}>
                    {item.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

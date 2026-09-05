import Link from "next/link";
import styles from "./page.module.css";
import { GameShowcase } from "@/components/GameShowcase";
import { HeroRotator } from "@/components/HeroRotator";
import { HowItWorks } from "@/components/HowItWorks";
import { ProductTile } from "@/components/ProductTile";
import { TrustStrip } from "@/components/TrustStrip";
import { toStoreProduct } from "@/lib/catalog-mapper";
import { sortForHero } from "@/lib/products";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { getDb } from "@/server/db/client";
import { listCatalogProducts } from "@/server/services/catalog";
import { getActiveGameVisualMap, getActiveProductVisualMap } from "@/server/services/game-visuals";
import { getPriceEstimateContext } from "@/server/services/geo-price";

export default async function Home() {
  const db = getDb();
  const [catalogProducts, heroMap, heroProductMap, showcaseMap, priceEstimate] = await Promise.all([
    listCatalogProducts(db),
    getActiveGameVisualMap(db, "hero"),
    getActiveProductVisualMap(db, "hero"),
    getActiveGameVisualMap(db, "showcase"),
    getPriceEstimateContext(),
  ]);
  const products = catalogProducts.map(toStoreProduct);
  const catalogPreview = products.slice(0, 4);
  const heroProducts = sortForHero(products);

  return (
    <div className={styles.shell}>
      {/* Organization/WebSite — solo acá, no en cada página (ver el comentario en lib/seo.ts). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organizationJsonLd() }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: websiteJsonLd() }} />
      <main className={styles.main}>
        <HeroRotator
          products={heroProducts}
          gameImages={Object.fromEntries(heroMap)}
          productImages={Object.fromEntries(heroProductMap)}
        />

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.kicker}>01 · Catálogo</p>
              <h2>Elegí tu juego</h2>
            </div>
          </div>
          <GameShowcase gameImages={Object.fromEntries(showcaseMap)} prefetch={false} />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.kicker}>02 · Elegí en vivo</p>
              <h2>Denominaciones disponibles</h2>
            </div>
            <Link href="/catalogo" className={styles.sectionLink}>
              Ver catálogo completo →
            </Link>
          </div>
          <div className={styles.productGrid}>
            {catalogPreview.map((product, index) => (
              <ProductTile
                product={product}
                prefetch={false}
                index={index}
                priceEstimate={priceEstimate}
                key={product.id}
              />
            ))}
          </div>
        </section>

        <TrustStrip />

        <section className={`${styles.section} ${styles.stepsSection}`} id="como-funciona">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.kicker}>03 · Proceso</p>
              <h2>Cómo funciona</h2>
            </div>
          </div>
          <HowItWorks />
        </section>
      </main>
    </div>
  );
}

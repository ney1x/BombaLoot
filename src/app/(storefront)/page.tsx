import Link from "next/link";
import styles from "./page.module.css";
import { GameShowcase } from "@/components/GameShowcase";
import { HeroRotator } from "@/components/HeroRotator";
import { HowItWorks } from "@/components/HowItWorks";
import { ProductTile } from "@/components/ProductTile";
import { TrustStrip } from "@/components/TrustStrip";
import { toStoreProduct } from "@/lib/catalog-mapper";
import { getDb } from "@/server/db/client";
import { listCatalogProducts } from "@/server/services/catalog";
import { getActiveGameVisualMap } from "@/server/services/game-visuals";

export default async function Home() {
  const db = getDb();
  const [catalogProducts, heroMap, showcaseMap] = await Promise.all([
    listCatalogProducts(db),
    getActiveGameVisualMap(db, "hero"),
    getActiveGameVisualMap(db, "showcase"),
  ]);
  const products = catalogProducts.map(toStoreProduct);
  const catalogPreview = products.slice(0, 4);

  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <HeroRotator products={products} gameImages={Object.fromEntries(heroMap)} />

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.kicker}>01 · Catálogo</p>
              <h2>Elegí tu juego</h2>
            </div>
          </div>
          <GameShowcase gameImages={Object.fromEntries(showcaseMap)} />
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
            {catalogPreview.map((product) => (
              <ProductTile product={product} key={product.id} />
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

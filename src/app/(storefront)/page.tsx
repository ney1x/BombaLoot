import Link from "next/link";
import styles from "./page.module.css";
import { GameShowcase } from "@/components/GameShowcase";
import { HeroRotator } from "@/components/HeroRotator";
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
    <main className={styles.main}>
      <HeroRotator products={products} gameImages={Object.fromEntries(heroMap)} />

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Elegí tu juego</h2>
        </div>
        <GameShowcase gameImages={Object.fromEntries(showcaseMap)} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Denominaciones disponibles</h2>
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
          <h2>Cómo funciona</h2>
        </div>
        <div className={styles.steps}>
          <div className={styles.step}>
            <span className={styles.stepNum}>1</span>
            <div>
              <h3>Elegís y pagás</h3>
              <p>Seleccioná la denominación exacta y pagá con Nequi/Wompi o PayPal, con o sin cuenta.</p>
            </div>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>2</span>
            <div>
              <h3>Confirmamos con el proveedor</h3>
              <p>El pago se valida directamente con el proveedor antes de asignarte un código.</p>
            </div>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>3</span>
            <div>
              <h3>Recibís tu código</h3>
              <p>Aparece en tu pedido al instante — y por email como respaldo.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

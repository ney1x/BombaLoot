import type { Metadata } from "next";
import styles from "./carrito.module.css";
import { CartView } from "@/components/CartView";

export const metadata: Metadata = {
  title: "Carrito — Loadout",
};

export default function CarritoPage() {
  return (
    <main className={styles.main}>
      <div className={styles.head}>
        <h1>Carrito</h1>
      </div>
      <CartView />
    </main>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import styles from "./checkout.module.css";
import { CheckoutView } from "@/components/CheckoutView";

export const metadata: Metadata = {
  title: "Checkout — bombaloot",
};

export default function CheckoutPage() {
  return (
    <main className={styles.page}>
      <div className={styles.head}>
        <h1>Checkout</h1>
      </div>
      <Suspense fallback={null}>
        <CheckoutView />
      </Suspense>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useMemo } from "react";
import styles from "@/app/(storefront)/carrito/carrito.module.css";
import { CartLineItem } from "./CartLineItem";
import { EmptyState } from "./EmptyState";
import { CartEmptyIcon, ChevronRightIcon } from "./icons";
import { useCart } from "@/lib/cart-context";
import { useCatalog } from "@/lib/use-catalog";
import { useSession } from "@/lib/session-context";
import { maxAddableQuantity, formatCop } from "@/lib/products";
import { tierForPurchases } from "@/lib/user";

export function CartView() {
  const { lines, updateQuantity, removeItem } = useCart();
  const products = useCatalog();
  const { user } = useSession();
  const tier = tierForPurchases(user?.purchasesCount ?? 0);

  const resolved = useMemo(
    () =>
      lines
        .map((line) => ({ line, product: products?.find((p) => p.id === line.productId) }))
        .filter((entry): entry is { line: typeof entry.line; product: NonNullable<typeof entry.product> } =>
          Boolean(entry.product),
        ),
    [lines, products],
  );

  const subtotal = resolved.reduce((sum, { line, product }) => sum + product.priceCop * line.quantity, 0);
  const discount = Math.round(subtotal * (tier.discountPct / 100));
  const total = subtotal - discount;

  /*
   * El carrito vacío no depende del catálogo — `lines` (localStorage) ya
   * lo sabemos sin esperar la respuesta de /api/catalog. Antes esto
   * esperaba a `products` incluso para el caso vacío: en una red lenta
   * (LTE, túnel), la página quedaba en blanco sin ningún indicador,
   * indistinguible de "está roto" para quien mira. Con líneas reales sí
   * hace falta el catálogo (precio/stock vigente), así que ahí sí se
   * muestra un esqueleto mientras carga.
   */
  if (lines.length === 0) {
    return (
      <EmptyState
        icon={CartEmptyIcon}
        title="Tu carrito está vacío"
        body="Elegí la denominación que necesitás en el catálogo y aparecerá acá, lista para pagar."
        actionHref="/catalogo"
        actionLabel="Explorar catálogo"
      />
    );
  }

  if (products === null) {
    return (
      <div className={styles.grid} aria-busy="true">
        <div className={styles.column}>
          <div className={styles.lines}>
            {lines.map((line) => (
              <div key={line.productId} className={styles.lineSkeleton} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      <div className={styles.column}>
        <div className={styles.lines}>
          {resolved.map(({ line, product }) => (
            <CartLineItem
              key={product.id}
              product={product}
              quantity={line.quantity}
              maxQuantity={maxAddableQuantity(product)}
              onIncrease={() => updateQuantity(product.id, line.quantity + 1)}
              onDecrease={() => updateQuantity(product.id, line.quantity - 1)}
              onRemove={() => removeItem(product.id)}
            />
          ))}
        </div>
        <Link href="/catalogo" className={styles.continueLink}>
          Continuar comprando <ChevronRightIcon />
        </Link>
      </div>

      <aside className={styles.summary}>
        <h2>Resumen</h2>
        <div className={styles.summaryRow}>
          <span>Subtotal</span>
          <span className={`${styles.value} num-display`}>{formatCop(subtotal)}</span>
        </div>
        <div className={`${styles.summaryRow} ${discount > 0 ? styles.discount : ""}`}>
          <span>Descuento{discount > 0 ? ` (${tier.name} · ${tier.discountPct}%)` : ""}</span>
          <span className={`${styles.value} num-display`}>{discount > 0 ? `−${formatCop(discount)}` : formatCop(0)}</span>
        </div>
        <div className={styles.summaryDivider} />
        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>Total</span>
          <span className={`${styles.totalValue} num-display`}>{formatCop(total)}</span>
        </div>
        <Link href="/checkout" className="btn btnPrimary">
          Finalizar compra
        </Link>
        <Link href="/catalogo" className="btn btnQuiet">
          Continuar comprando
        </Link>
        <p className={styles.guestNote}>Podés pagar como invitado, sin crear cuenta.</p>
      </aside>

      <div className={styles.mobileBar}>
        <div className={styles.mobileBarTotal}>
          <span className={styles.mobileBarLabel}>Total</span>
          <span className={`${styles.mobileBarValue} num-display`}>{formatCop(total)}</span>
        </div>
        <Link href="/checkout" className="btn btnPrimary">
          Finalizar compra
        </Link>
      </div>
    </div>
  );
}

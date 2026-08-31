"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./GamePurchase.module.css";
import { GameImageSlot } from "./GameImageSlot";
import { CheckIcon, PackageCheckIcon, ShieldCheckIcon } from "./icons";
import { GAME_COLORS, maxAddableQuantity, formatCop, type GameId, type Product } from "@/lib/products";
import { useCart } from "@/lib/cart-context";

const PAYMENT_METHODS = ["Nequi", "PSE", "Tarjetas", "PayPal"];

export function GamePurchase({
  game,
  products,
  initialSelectId,
}: {
  game: { id: GameId; label: string };
  products: Product[];
  initialSelectId?: string;
}) {
  const firstAvailable = products.find((p) => p.stock !== "out") ?? null;
  const initialProduct =
    (initialSelectId && products.find((p) => p.id === initialSelectId && p.stock !== "out")) ||
    firstAvailable;

  const [selectedId, setSelectedId] = useState<string | null>(initialProduct?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { addItem } = useCart();

  const selected = useMemo(
    () => products.find((p) => p.id === selectedId) ?? null,
    [products, selectedId],
  );

  const maxQty = selected ? maxAddableQuantity(selected) : 0;
  const color = GAME_COLORS[game.id];

  function selectProduct(product: Product) {
    if (product.stock === "out") return;
    setSelectedId(product.id);
    setQuantity(1);
    setAdded(false);
  }

  function addToCart() {
    if (!selected) return;
    addItem(selected.id, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  }

  return (
    <main className={styles.main}>
      <p className={styles.crumb}>
        <Link href="/">Home</Link> / {game.label}
      </p>

      <div className={styles.grid}>
        <div className={styles.visual}>
          <div className={styles.visualPanel}>
            <GameImageSlot
              gameId={game.id}
              label={game.label}
              sizeHint="680×680"
              sizes="(max-width: 860px) 320px, 340px"
              priority
              imageUrl={selected?.imageUrl}
            />
          </div>
          <div className={styles.calloutCard}>
            <h3>Entrega automática</h3>
            <p>Apenas confirmamos el pago con el proveedor, el código queda disponible en tu pedido.</p>
          </div>
        </div>

        <div>
          <h1 className={styles.title}>{game.label}</h1>
          <p className={styles.meta}>Recarga digital · entrega inmediata tras confirmación de pago</p>

          <div className={styles.badgeRow}>
            <span className={styles.pill}>
              <ShieldCheckIcon /> Pago seguro
            </span>
            <span className={styles.pill}>
              <PackageCheckIcon /> Entrega automática
            </span>
          </div>

          <div className={styles.sectionLabel}>Elegí tu denominación</div>
          <div className={styles.pickerGrid}>
            {products.map((product) => {
              const isOut = product.stock === "out";
              const isActive = product.id === selectedId;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => selectProduct(product)}
                  disabled={isOut}
                  aria-pressed={isActive}
                  className={`${styles.pickCard} ${isActive ? styles.pickCardActive : ""} ${isOut ? styles.pickCardOut : ""}`}
                  style={
                    isActive
                      ? { borderColor: color.base, background: `${color.base}14` }
                      : undefined
                  }
                >
                  {isActive && (
                    <span className={styles.pickCheck} style={{ background: color.base }}>
                      <CheckIcon />
                    </span>
                  )}
                  {product.stock === "low" && (
                    <span className={styles.pickTag}>ÚLT. {product.lowStockCount}</span>
                  )}
                  <span className={`${styles.pickDenom} num-display`}>{product.denomination}</span>
                  <span className={styles.pickUnit}>{product.unit}</span>
                  <span className={`${styles.pickPrice} num-display`}>
                    {isOut ? "Agotado" : formatCop(product.priceCop)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={styles.orderPanel}>
          {selected ? (
            <div className={styles.orderCard}>
              <div className={styles.priceLabel}>Precio</div>
              <div className={styles.priceRow}>
                <span className={`${styles.priceValue} num-display`}>
                  {formatCop(selected.priceCop * quantity)}
                </span>
                <span className={styles.priceNote}>Precio final, impuestos incluidos</span>
              </div>
              <div className={styles.priceSelected}>
                {selected.denomination} {selected.unit}
              </div>

              <div className={styles.qtyRow}>
                <div className={styles.stepper}>
                  <button
                    type="button"
                    className={styles.stepperBtn}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    aria-label="Disminuir cantidad"
                  >
                    −
                  </button>
                  <span className={`${styles.stepperValue} num-display`}>{quantity}</span>
                  <button
                    type="button"
                    className={styles.stepperBtn}
                    onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                    disabled={quantity >= maxQty}
                    aria-label="Aumentar cantidad"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className={`${styles.addBtn} ${added ? styles.addBtnDone : ""}`}
                  onClick={addToCart}
                >
                  {added ? "Agregado ✓" : "Agregar al carrito"}
                </button>
              </div>

              <Link
                href="/carrito"
                className={styles.continueBtn}
                style={{ background: color.base }}
                onClick={() => addItem(selected.id, quantity)}
              >
                Continuar
              </Link>
            </div>
          ) : (
            <p className={styles.soldOutNote}>
              Todas las denominaciones de {game.label} están agotadas por el momento.
            </p>
          )}

          <div className={styles.payments}>
            <div className={styles.paymentPills}>
              {PAYMENT_METHODS.map((method) => (
                <span className={styles.paymentPill} key={method}>
                  {method}
                </span>
              ))}
            </div>
            <p className={styles.paymentNote}>Entrega automática al confirmarse el pago.</p>
          </div>
          </div>
        </div>
      </div>
    </main>
  );
}

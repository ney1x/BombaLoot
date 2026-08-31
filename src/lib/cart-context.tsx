"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "loadout-cart";

interface CartLine {
  productId: string;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  addItem: (productId: string, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  count: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Hidratación desde localStorage — client-only, diferida tras el
    // primer render para no desincronizar el HTML de servidor/cliente.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setLines(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {}
  }, [lines, hydrated]);

  const value = useMemo<CartContextValue>(() => {
    function addItem(productId: string, quantity = 1) {
      setLines((prev) => {
        const existing = prev.find((l) => l.productId === productId);
        if (existing) {
          return prev.map((l) =>
            l.productId === productId ? { ...l, quantity: l.quantity + quantity } : l,
          );
        }
        return [...prev, { productId, quantity }];
      });
    }

    function updateQuantity(productId: string, quantity: number) {
      // Bajar a 0 deja la línea visible (se puede volver a subir con "+");
      // solo removeItem la saca de la lista.
      const clamped = Math.max(0, quantity);
      setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity: clamped } : l)));
    }

    function removeItem(productId: string) {
      setLines((prev) => prev.filter((l) => l.productId !== productId));
    }

    function clear() {
      setLines([]);
    }

    return {
      lines,
      addItem,
      updateQuantity,
      removeItem,
      clear,
      count: lines.reduce((sum, l) => sum + l.quantity, 0),
    };
  }, [lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

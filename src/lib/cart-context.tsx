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
    /*
     * Persistimos en localStorage EN EL MISMO tick que actualizamos el
     * estado, no solo vía el useEffect de arriba. Un botón que agrega al
     * carrito y navega en el mismo click (ej. "Continuar" en
     * GamePurchase) puede desmontar este provider antes de que el efecto
     * llegue a correr — la navegación de Link gana la carrera contra un
     * effect que se agenda para después del commit, y el carrito se pierde
     * en silencio. Escribiendo acá, con el array ya calculado en mano, no
     * hay ventana en la que un usuario pueda navegar antes de guardar.
     */
    function persist(next: CartLine[]) {
      setLines(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
    }

    function addItem(productId: string, quantity = 1) {
      const existing = lines.find((l) => l.productId === productId);
      const next = existing
        ? lines.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + quantity } : l))
        : [...lines, { productId, quantity }];
      persist(next);
    }

    function updateQuantity(productId: string, quantity: number) {
      // Bajar a 0 deja la línea visible (se puede volver a subir con "+");
      // solo removeItem la saca de la lista.
      const clamped = Math.max(0, quantity);
      persist(lines.map((l) => (l.productId === productId ? { ...l, quantity: clamped } : l)));
    }

    function removeItem(productId: string) {
      persist(lines.filter((l) => l.productId !== productId));
    }

    function clear() {
      persist([]);
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

"use client";

import { useEffect, useState } from "react";
import type { Product } from "./products";
import { toStoreProduct, type RawCatalogProduct } from "./catalog-mapper";

/**
 * Catálogo real vía `/api/catalog`, para componentes cliente que necesitan
 * resolver un `productId` de cualquier línea del carrito (precio y stock
 * pueden haber cambiado desde que se agregó). `null` mientras carga.
 */
export function useCatalog(): Product[] | null {
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { products: RawCatalogProduct[] }) => {
        if (!cancelled) setProducts(data.products.map(toStoreProduct));
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return products;
}

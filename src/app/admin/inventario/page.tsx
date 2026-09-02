import type { Metadata } from "next";
import Link from "next/link";
import shared from "../shared.module.css";
import { getDb } from "@/server/db/client";
import { formatCop } from "@/lib/products";
import { listAdminProducts } from "@/server/services/admin-products";

export const metadata: Metadata = { title: "Inventario — Admin bombaloot" };

const STOCK_LABEL: Record<string, string> = { available: "OK", low: "STOCK BAJO", out: "AGOTADO" };
const STOCK_TONE: Record<string, string> = { available: "good", low: "warn", out: "bad" };

/**
 * Vista operativa: todo el inventario, con el desglose completo por
 * estado de código. `stock` sale del mismo cálculo que usa el catálogo
 * público y el dashboard — nunca una columna aparte.
 */
export default async function InventoryPage() {
  const products = await listAdminProducts(getDb());
  const sorted = [...products].sort((a, b) => {
    const order = { out: 0, low: 1, available: 2 };
    return order[a.stock] - order[b.stock];
  });

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Inventario</h1>
          <p className={shared.subtitle}>Disponibilidad real por producto — códigos AVAILABLE reclamables</p>
        </div>
      </div>

      <div className={shared.tableWrap}>
        <table className={shared.table}>
          <thead>
            <tr>
              <th>Juego</th>
              <th>Producto</th>
              <th>Precio</th>
              <th>Disponible</th>
              <th>Reservado</th>
              <th>Pagado</th>
              <th>Entregado</th>
              <th>Umbral</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}>
                <td>{p.gameLabel}</td>
                <td>
                  <Link href={`/admin/productos/${p.id}`} className={shared.mono}>
                    {p.denomination} {p.unit}
                  </Link>
                </td>
                <td className="num-display">{formatCop(p.priceCop)}</td>
                <td className="num-display">{p.available}</td>
                <td className="num-display">{p.reserved}</td>
                <td className="num-display">{p.paid}</td>
                <td className="num-display">{p.delivered}</td>
                <td className="num-display">{p.lowStockAt}</td>
                <td>
                  <span className={shared.badge} data-tone={STOCK_TONE[p.stock]}>
                    {STOCK_LABEL[p.stock]}
                  </span>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className={shared.empty}>
                  No hay productos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

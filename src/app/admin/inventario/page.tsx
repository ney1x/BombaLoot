import type { Metadata } from "next";
import Link from "next/link";
import shared from "../shared.module.css";
import { STOCK_LABEL, STOCK_TONE, sortBySeverity } from "../stock-labels";
import { GAMES } from "@/lib/products";
import { getDb } from "@/server/db/client";
import { formatCop } from "@/lib/products";
import { listAdminProducts, type AdminProductRow } from "@/server/services/admin-products";

export const metadata: Metadata = { title: "Inventario — Admin BombaLoot" };

/**
 * Vista operativa: todo el inventario, con el desglose completo por
 * estado de código. `stock` sale del mismo cálculo que usa el catálogo
 * público y el dashboard — nunca una columna aparte.
 *
 * A diferencia de `/admin/productos` (gestión: editar precio, descripción,
 * activar/desactivar), esta página es solo lectura y existe para triage de
 * stock — de ahí el orden por severidad y el resumen arriba. Se lo dice
 * explícito en el subtítulo, no solo en un comentario de código.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; status?: string }>;
}) {
  const { game, status } = await searchParams;
  const products = await listAdminProducts(getDb());
  const sorted = sortBySeverity(products);

  const filtered = sorted.filter((p) => {
    if (game && p.gameId !== game) return false;
    if (status && p.stock !== status) return false;
    return true;
  });

  const outCount = products.filter((p) => p.stock === "out").length;
  const lowCount = products.filter((p) => p.stock === "low").length;

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Inventario</h1>
          <p className={shared.subtitle}>
            Solo lectura, para triage de stock — <Link href="/admin/productos">gestionar un producto</Link> se
            hace desde Productos.
          </p>
          <p className={shared.subtitle}>
            {outCount} agotado(s) · {lowCount} con stock bajo · {products.length} producto(s) en total
          </p>
        </div>
      </div>

      <form className={shared.filterForm} method="get">
        <select name="game" defaultValue={game ?? ""}>
          <option value="">Todos los juegos</option>
          {GAMES.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""}>
          <option value="">Todos los stocks</option>
          <option value="out">{STOCK_LABEL.out}</option>
          <option value="low">{STOCK_LABEL.low}</option>
          <option value="available">{STOCK_LABEL.available}</option>
        </select>
        <button type="submit" className={shared.btnSmall}>
          Filtrar
        </button>
        <Link href="/admin/inventario" className={shared.btnSmall}>
          Limpiar
        </Link>
      </form>

      <div className={shared.tableWrap}>
        <table className={shared.table}>
          <thead>
            <tr>
              <th scope="col">Juego</th>
              <th scope="col">Producto</th>
              <th scope="col">Precio</th>
              <th scope="col">Disponible</th>
              <th scope="col">Reservado</th>
              <th scope="col">Pagado</th>
              <th scope="col">Entregado</th>
              <th scope="col">Umbral</th>
              <th scope="col">Stock</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: AdminProductRow) => (
              <tr key={p.id} data-tone={STOCK_TONE[p.stock] === "good" ? undefined : STOCK_TONE[p.stock]}>
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className={shared.empty}>
                  {products.length === 0 ? "No hay productos todavía." : "Ningún producto coincide con el filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import shared from "../shared.module.css";
import { STOCK_LABEL, STOCK_TONE, sortBySeverity } from "../stock-labels";
import { getCurrentSession } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { formatCop } from "@/lib/products";
import { listAdminProducts } from "@/server/services/admin-products";

export const metadata: Metadata = { title: "Productos — Admin BombaLoot" };

export default async function AdminProductsPage() {
  const [session, products] = await Promise.all([getCurrentSession(), listAdminProducts(getDb())]);
  const canEdit = session?.role === "ADMIN";
  const sorted = sortBySeverity(products);

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Productos</h1>
          <p className={shared.subtitle}>{products.length} producto(s) — activos e inactivos</p>
          <p className={shared.subtitle}>
            Para triage de stock (qué está agotado, en qué orden) usá <Link href="/admin/inventario">Inventario</Link>.
          </p>
        </div>
        {canEdit && (
          <Link href="/admin/productos/nuevo" className={`${shared.btnSmall} ${shared.btnSmallPrimary}`}>
            + Nuevo producto
          </Link>
        )}
      </div>

      <div className={shared.tableWrap}>
        <table className={shared.table}>
          <thead>
            <tr>
              <th scope="col">Juego</th>
              <th scope="col">Producto</th>
              <th scope="col">Precio</th>
              <th scope="col">Disponible</th>
              <th scope="col">Reservado</th>
              <th scope="col">Vendido</th>
              <th scope="col">Umbral</th>
              <th scope="col">Stock</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className={shared.srOnly}>Acciones</span>
              </th>
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
                <td className="num-display">{p.paid + p.delivered}</td>
                <td className="num-display">{p.lowStockAt}</td>
                <td>
                  <span className={shared.badge} data-tone={STOCK_TONE[p.stock]}>
                    {STOCK_LABEL[p.stock]}
                  </span>
                </td>
                <td>
                  <span className={shared.badge} data-tone={p.isActive ? "good" : undefined}>
                    {p.isActive ? "ACTIVO" : "INACTIVO"}
                  </span>
                </td>
                <td>
                  <Link
                    href={`/admin/productos/${p.id}`}
                    className={shared.btnSmall}
                    aria-label={`${canEdit ? "Editar" : "Ver"} ${p.gameLabel} · ${p.denomination} ${p.unit}`}
                  >
                    {canEdit ? "Editar" : "Ver"}
                  </Link>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={10} className={shared.empty}>
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

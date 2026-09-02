import type { Metadata } from "next";
import Link from "next/link";
import shared from "../shared.module.css";
import { getCurrentSession } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { formatCop } from "@/lib/products";
import { listAdminProducts } from "@/server/services/admin-products";

export const metadata: Metadata = { title: "Productos — Admin bombaloot" };

const STOCK_LABEL: Record<string, string> = { available: "OK", low: "STOCK BAJO", out: "AGOTADO" };
const STOCK_TONE: Record<string, string> = { available: "good", low: "warn", out: "bad" };

export default async function AdminProductsPage() {
  const [session, products] = await Promise.all([getCurrentSession(), listAdminProducts(getDb())]);
  const canEdit = session?.role === "ADMIN";

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Productos</h1>
          <p className={shared.subtitle}>{products.length} producto(s) — activos e inactivos</p>
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
              <th>Juego</th>
              <th>Producto</th>
              <th>Precio</th>
              <th>Disponible</th>
              <th>Reservado</th>
              <th>Vendido</th>
              <th>Stock</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
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
                  <Link href={`/admin/productos/${p.id}`} className={shared.btnSmall}>
                    {canEdit ? "Editar" : "Ver"}
                  </Link>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
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

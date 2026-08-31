import type { Metadata } from "next";
import Link from "next/link";
import shared from "../../shared.module.css";
import { requireAdmin } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { listGames } from "@/server/services/admin-products";
import { ProductCreateForm } from "@/components/admin/ProductCreateForm";

export const metadata: Metadata = { title: "Nuevo producto — Admin Loadout" };

/** Crear producto es ADMIN-only — SUPPORT nunca llega a ver este formulario. */
export default async function NewProductPage() {
  await requireAdmin();
  const games = await listGames(getDb());

  return (
    <div className={shared.page}>
      <Link href="/admin/productos" className={shared.backLink}>
        ← Productos
      </Link>
      <h1 className={shared.title}>Nuevo producto</h1>
      <ProductCreateForm games={games} />
    </div>
  );
}

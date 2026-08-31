import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import shared from "../../shared.module.css";
import { getCurrentSession } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { getAdminProduct } from "@/server/services/admin-products";
import { listCodesForProduct } from "@/server/services/admin-codes";
import { listProductImages } from "@/server/services/admin-images";
import { ProductEditForm } from "@/components/admin/ProductEditForm";
import { CodesManager } from "@/components/admin/CodesManager";
import { ImagesManager } from "@/components/admin/ImagesManager";

export const metadata: Metadata = { title: "Producto — Admin Loadout" };

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, product] = await Promise.all([getCurrentSession(), getAdminProduct(getDb(), id)]);
  if (!product) notFound();

  const [codes, images] = await Promise.all([listCodesForProduct(getDb(), id), listProductImages(getDb(), id)]);
  const canEdit = session?.role === "ADMIN";

  return (
    <div className={shared.page}>
      <Link href="/admin/productos" className={shared.backLink}>
        ← Productos
      </Link>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>
            {product.gameLabel} · {product.denomination} {product.unit}
          </h1>
          <p className={shared.subtitle}>
            {product.available} disponibles · {product.reserved} reservados · {product.paid + product.delivered} vendidos
          </p>
        </div>
      </div>

      <ProductEditForm
        product={{
          id: product.id,
          denomination: product.denomination,
          unit: product.unit,
          description: product.description,
          priceCop: product.priceCop,
          maxPerOrder: product.maxPerOrder,
          lowStockAt: product.lowStockAt,
          isActive: product.isActive,
        }}
        canEdit={canEdit}
      />

      <h2 className={shared.title} style={{ fontSize: 16 }}>
        Imágenes
      </h2>
      <ImagesManager
        productId={product.id}
        initialImages={images.map((img) => ({
          id: img.id,
          imageUrl: img.imageUrl,
          altText: img.altText,
          isPrimary: img.isPrimary,
          sortOrder: img.sortOrder,
          isActive: img.isActive,
        }))}
        canEdit={canEdit}
      />

      <h2 className={shared.title} style={{ fontSize: 16 }}>
        Códigos
      </h2>
      <CodesManager
        productId={product.id}
        initialCodes={codes.map((c) => ({
          id: c.id,
          status: c.status,
          fingerprint: c.fingerprint,
          orderItemId: c.orderItemId,
          createdAt: c.createdAt.toISOString(),
          deliveredAt: c.deliveredAt ? c.deliveredAt.toISOString() : null,
          uploadedById: c.uploadedById,
          uploadedByName: c.uploadedByName,
        }))}
        canEdit={canEdit}
        currentUserId={session?.userId ?? null}
      />
    </div>
  );
}

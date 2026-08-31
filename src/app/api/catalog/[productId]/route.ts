import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { getCatalogProduct } from "@/server/services/catalog";

export async function GET(_request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const product = await getCatalogProduct(getDb(), productId);

  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ product });
}

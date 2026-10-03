import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { listCatalogProducts } from "@/server/services/catalog";

export async function GET() {
  const products = await listCatalogProducts(getDb());
  return NextResponse.json({ products });
}

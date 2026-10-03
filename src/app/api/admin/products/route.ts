import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { createProduct, createProductSchema, listAdminProducts } from "@/server/services/admin-products";

/** Ver productos: ADMIN o SUPPORT (parte de "ver inventario"). Crear: solo ADMIN. */
export async function GET() {
  try {
    await requireAdminOrSupportApi();
    const products = await listAdminProducts(getDb());
    return NextResponse.json({ products });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminApi();
    const input = createProductSchema.parse(await request.json());
    await createProduct(getPool(), actor, input, requestMeta(request));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

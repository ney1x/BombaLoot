import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { ProductNotFoundError } from "@/server/services/errors";
import { getAdminProduct, updateProduct, updateProductSchema } from "@/server/services/admin-products";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrSupportApi();
    const { id } = await params;
    const product = await getAdminProduct(getDb(), id);
    if (!product) throw new ProductNotFoundError(id);
    return NextResponse.json({ product });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminApi();
    const { id } = await params;
    const input = updateProductSchema.parse(await request.json());
    await updateProduct(getPool(), actor, id, input, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

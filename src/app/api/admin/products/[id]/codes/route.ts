import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { addCodesSchema, bulkAddCodes, listCodesForProduct } from "@/server/services/admin-codes";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrSupportApi();
    const { id } = await params;
    const codes = await listCodesForProduct(getDb(), id);
    return NextResponse.json({ codes });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

/** Carga masiva de códigos — solo ADMIN (gestión de inventario es ADMIN-only). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminApi();
    const { id } = await params;
    const { codes, note } = addCodesSchema.parse(await request.json());
    const result = await bulkAddCodes(getPool(), actor, id, codes, note, requestMeta(request));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

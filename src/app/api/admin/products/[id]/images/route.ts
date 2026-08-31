import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { addImageSchema, addProductImage, listProductImages } from "@/server/services/admin-images";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrSupportApi();
    const { id } = await params;
    const images = await listProductImages(getDb(), id);
    return NextResponse.json({ images });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminApi();
    const { id } = await params;
    const input = addImageSchema.parse(await request.json());
    const imageId = await addProductImage(getPool(), actor, id, input, requestMeta(request));
    return NextResponse.json({ ok: true, imageId }, { status: 201 });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { addGameVisual, addGameVisualSchema, listGameVisuals } from "@/server/services/game-visuals";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrSupportApi();
    const { id } = await params;
    const visuals = await listGameVisuals(getDb(), id);
    return NextResponse.json({ visuals });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

/** Carga de banners de juego — ADMIN-only, mismo criterio que imágenes de producto. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminApi();
    const { id } = await params;
    const input = addGameVisualSchema.parse(await request.json());
    const visualId = await addGameVisual(getPool(), actor, id, input, requestMeta(request));
    return NextResponse.json({ id: visualId }, { status: 201 });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

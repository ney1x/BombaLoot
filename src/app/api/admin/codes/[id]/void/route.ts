import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { voidCode } from "@/server/services/admin-codes";

/**
 * Anula un código (lo saca de la venta sin borrarlo) — solo ADMIN dueño del
 * lote, y solo mientras el código sigue `AVAILABLE`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminApi();
    const { id } = await params;
    await voidCode(getPool(), actor, id, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

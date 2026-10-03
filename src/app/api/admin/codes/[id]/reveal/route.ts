import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { revealCode } from "@/server/services/admin-codes";

/**
 * Revela el código en claro detrás de un fingerprint — solo ADMIN dueño del
 * lote, y solo mientras el código sigue `AVAILABLE`. POST (no GET) para que
 * el secreto nunca quede en una URL que un proxy o el historial del
 * navegador puedan loguear.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminApi();
    const { id } = await params;
    const code = await revealCode(getPool(), actor, id, requestMeta(request));
    return NextResponse.json({ code });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

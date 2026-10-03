import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { assignSupportRole, removeSupportRole } from "@/server/services/admin-service";

/**
 * Gestión del rol SUPPORT sobre un usuario puntual. Solo ADMIN — verificado
 * acá server-side por `requireAdminApi()`, nunca a partir de nada que mande
 * el cliente. SUPPORT que pega directo a esta ruta recibe 403 desde el guard
 * antes de tocar el servicio.
 */

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminApi();
    const { id } = await params;
    await assignSupportRole(getPool(), actor, id, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminApi();
    const { id } = await params;
    await removeSupportRole(getPool(), actor, id, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

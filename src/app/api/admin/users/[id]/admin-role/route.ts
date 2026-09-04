import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdminApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { removeAdminRole, restoreAdminRole } from "@/server/services/admin-service";

/**
 * `DELETE` quita ADMIN (vuelve a CUSTOMER). `POST` lo restaura — solo
 * funciona si esta cuenta YA fue ADMIN antes (lo valida `restoreAdminRole`
 * contra el log de auditoría, no el cliente); promover a ADMIN por primera
 * vez sigue pasando únicamente por `/api/admin/invites`. Los dos son
 * SUPERADMIN-only — un ADMIN normal ya no puede tocar el rol ADMIN de nadie.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireSuperAdminApi();
    const { id } = await params;
    await restoreAdminRole(getPool(), actor, id, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireSuperAdminApi();
    const { id } = await params;
    await removeAdminRole(getPool(), actor, id, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdminApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { revokeAdminInvite } from "@/server/services/admin-service";

/** Cancela una invitación a ADMIN pendiente — SUPERADMIN-only. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireSuperAdminApi();
    const { id } = await params;
    await revokeAdminInvite(getPool(), actor, id, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

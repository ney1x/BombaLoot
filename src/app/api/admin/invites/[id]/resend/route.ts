import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdminApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { resendAdminInvite } from "@/server/services/admin-service";

/** Reenvía una invitación a ADMIN pendiente (token nuevo, vence de nuevo en 7 días) — SUPERADMIN-only. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireSuperAdminApi();
    const { id } = await params;
    await resendAdminInvite(getPool(), actor, id, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

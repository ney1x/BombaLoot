import { NextResponse, type NextRequest } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { unblockIp } from "@/server/services/security-service";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ ip: string }> }) {
  try {
    const actor = await requireAdminOrSupportApi();
    const { ip } = await params;
    await unblockIp(getPool(), actor, decodeURIComponent(ip), requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

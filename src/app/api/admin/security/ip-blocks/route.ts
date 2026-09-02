import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { blockIp, listBlockedIps } from "@/server/services/security-service";

const blockSchema = z.object({
  ip: z.string().trim().min(3).max(64),
  reason: z.string().trim().min(5, "Contá brevemente por qué (mínimo 5 caracteres)").max(500),
});

export async function GET() {
  try {
    await requireAdminOrSupportApi();
    const blocks = await listBlockedIps(getDb());
    return NextResponse.json({ blocks });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminOrSupportApi();
    const { ip, reason } = blockSchema.parse(await request.json());
    await blockIp(getPool(), actor, ip, reason, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

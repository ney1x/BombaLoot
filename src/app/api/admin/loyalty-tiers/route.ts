import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { createLoyaltyTier, createTierSchema, listLoyaltyTiers } from "@/server/services/admin-loyalty";

export async function GET() {
  try {
    await requireAdminOrSupportApi();
    const tiers = await listLoyaltyTiers(getDb());
    return NextResponse.json({ tiers });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminApi();
    const input = createTierSchema.parse(await request.json());
    await createLoyaltyTier(getPool(), actor, input, requestMeta(request));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdminApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { recordAdminPayout, recordAdminPayoutSchema } from "@/server/services/admin-payouts";

/** Registrar una liquidación a un admin — solo SUPERADMIN (mueve lo que se le debe a cada uno). */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireSuperAdminApi();
    const input = recordAdminPayoutSchema.parse(await request.json());
    const payout = await recordAdminPayout(getPool(), actor, input, requestMeta(request));
    return NextResponse.json({ payout }, { status: 201 });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

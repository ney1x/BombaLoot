import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { createDiscountRule, createDiscountSchema, listDiscountRules } from "@/server/services/admin-discounts";

export async function GET() {
  try {
    await requireAdminOrSupportApi();
    const discounts = await listDiscountRules(getDb());
    return NextResponse.json({ discounts });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminApi();
    const input = createDiscountSchema.parse(await request.json());
    const id = await createDiscountRule(getPool(), actor, input, requestMeta(request));
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

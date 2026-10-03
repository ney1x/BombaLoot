import { NextResponse } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { countCustomersByTier } from "@/server/services/admin-loyalty";

export async function GET() {
  try {
    await requireAdminOrSupportApi();
    const counts = await countCustomersByTier(getDb());
    return NextResponse.json({ counts });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

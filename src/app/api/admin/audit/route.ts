import { NextResponse, type NextRequest } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { auditFiltersSchema, listAuditLogsAdmin } from "@/server/services/admin-audit";

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrSupportApi();
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const filters = auditFiltersSchema.parse(params);
    const entries = await listAuditLogsAdmin(getDb(), filters);
    return NextResponse.json({ entries });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

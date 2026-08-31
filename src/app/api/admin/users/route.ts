import { NextResponse, type NextRequest } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { listUsersAdmin, userFiltersSchema } from "@/server/services/admin-users";

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrSupportApi();
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const filters = userFiltersSchema.parse(params);
    const users = await listUsersAdmin(getDb(), filters);
    return NextResponse.json({ users });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { listTicketsAdmin } from "@/server/services/support-service";

/** ADMIN y SUPPORT ven la misma bandeja — es literalmente el trabajo de SUPPORT. */
export async function GET(request: NextRequest) {
  try {
    await requireAdminOrSupportApi();
    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const q = request.nextUrl.searchParams.get("q") ?? undefined;
    const tickets = await listTicketsAdmin(getDb(), { status, q });
    return NextResponse.json({ tickets });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

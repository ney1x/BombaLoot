import { NextResponse, type NextRequest } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { listRefundsAdmin } from "@/server/services/admin-refunds";

/** ADMIN y SUPPORT pueden revisar la cola (matriz de permisos de fase 6A) — solo ejecutar el manual es ADMIN-only. */
export async function GET(request: NextRequest) {
  try {
    await requireAdminOrSupportApi();
    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const refunds = await listRefundsAdmin(getDb(), status);
    return NextResponse.json({ refunds });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

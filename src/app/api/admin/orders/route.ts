import { NextResponse, type NextRequest } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { listOrdersAdmin, orderFiltersSchema } from "@/server/services/admin-orders";

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrSupportApi();
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const filters = orderFiltersSchema.parse(params);
    const orders = await listOrdersAdmin(getDb(), filters);
    return NextResponse.json({ orders });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

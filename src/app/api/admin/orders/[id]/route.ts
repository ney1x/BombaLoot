import { NextResponse, type NextRequest } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { AdminOrderNotFoundError } from "@/server/services/errors";
import { getOrderDetailAdmin } from "@/server/services/admin-orders";

/**
 * A diferencia de `/api/orders/[id]` (cliente), acá no hay filtro de
 * `user_id` — el admin puede ver cualquier pedido. La autorización es el
 * guard de rol, no un chequeo de ownership.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrSupportApi();
    const { id } = await params;
    const order = await getOrderDetailAdmin(getDb(), id);
    if (!order) throw new AdminOrderNotFoundError(id);
    return NextResponse.json({ order });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

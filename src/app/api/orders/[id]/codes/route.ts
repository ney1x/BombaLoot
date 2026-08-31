import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { deliverOrderCodes } from "@/server/services/payment/delivery-service";

/**
 * Entrega los códigos de un pedido ya pagado. El código nunca sale de la
 * base en claro hasta que el dueño del pedido lo pide explícitamente acá
 * — ni la confirmación del pago por sí sola lo revela.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getCurrentSession();
    const accessToken = request.nextUrl.searchParams.get("accessToken") ?? undefined;

    const result = await deliverOrderCodes(getPool(), {
      orderId: id,
      accessToken,
      userId: session?.userId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { getPaymentResult } from "@/server/services/payment/result-service";

/**
 * Estado de un intento de pago, para la pantalla de resultado. Nunca
 * confía en el redirect del navegador como fuente de verdad — si el
 * webhook parece perdido, sincroniza contra el proveedor antes de
 * responder (ver `result-service.ts`).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ paymentIntentId: string }> }) {
  try {
    const { paymentIntentId } = await params;
    const session = await getCurrentSession();
    const accessToken = request.nextUrl.searchParams.get("accessToken") ?? undefined;

    const result = await getPaymentResult(getPool(), {
      paymentIntentId,
      accessToken,
      userId: session?.userId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

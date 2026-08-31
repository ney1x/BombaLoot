import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { paymentInitSchema } from "@/server/services/payment/payment-schemas";
import { initWompiPayment } from "@/server/services/payment/payment-intent-service";

/**
 * Inicia el pago de un pedido con Wompi. El cliente solo identifica el
 * pedido y prueba que es suyo — el monto sale de `orders.total_cop`,
 * nunca del cuerpo de esta request.
 */
export async function POST(request: NextRequest) {
  try {
    const body = paymentInitSchema.parse(await request.json());
    const session = await getCurrentSession();

    const result = await initWompiPayment(getPool(), {
      orderId: body.orderId,
      accessToken: body.accessToken,
      userId: session?.userId,
      redirectBaseUrl: process.env.APP_URL ?? "http://localhost:3000",
    });

    return NextResponse.json({
      paymentIntentId: result.paymentIntentId,
      checkoutUrl: result.checkoutUrl,
    });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

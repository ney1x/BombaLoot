import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { paypalCaptureSchema } from "@/server/services/payment/payment-schemas";
import { capturePaypalPayment } from "@/server/services/payment/payment-intent-service";

/**
 * Captura server-side de una orden de PayPal ya aprobada por el cliente.
 * `paypalOrderId` NUNCA viene del cuerpo — sale de `payment_intents.provider_ref`.
 */
export async function POST(request: NextRequest) {
  try {
    const body = paypalCaptureSchema.parse(await request.json());
    const session = await getCurrentSession();

    const result = await capturePaypalPayment(getPool(), {
      paymentIntentId: body.paymentIntentId,
      accessToken: body.accessToken,
      userId: session?.userId,
    });

    return NextResponse.json({ status: result.status });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

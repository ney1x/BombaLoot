import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { wompiNequiInitSchema } from "@/server/services/payment/payment-schemas";
import { initWompiNequiPayment } from "@/server/services/payment/payment-intent-service";

/**
 * Único método de pago que NO pasa por el checkout alojado de Wompi
 * (`/api/payments/wompi/init`) — la transacción se crea acá mismo, server
 * to server, con el celular que mandó el comprador. El monto SIEMPRE sale
 * de `orders.total_cop`, nunca del cuerpo de esta request.
 */
export async function POST(request: NextRequest) {
  try {
    const body = wompiNequiInitSchema.parse(await request.json());
    const session = await getCurrentSession();

    const result = await initWompiNequiPayment(getPool(), {
      orderId: body.orderId,
      accessToken: body.accessToken,
      userId: session?.userId,
      phoneNumber: body.phoneNumber,
    });

    return NextResponse.json({ paymentIntentId: result.paymentIntentId, status: result.status });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

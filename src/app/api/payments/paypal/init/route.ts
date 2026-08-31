import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { paymentInitSchema } from "@/server/services/payment/payment-schemas";
import { initPaypalPayment } from "@/server/services/payment/payment-intent-service";

export async function POST(request: NextRequest) {
  try {
    const body = paymentInitSchema.parse(await request.json());
    const session = await getCurrentSession();

    const result = await initPaypalPayment(getPool(), {
      orderId: body.orderId,
      accessToken: body.accessToken,
      userId: session?.userId,
      returnBaseUrl: process.env.APP_URL ?? "http://localhost:3000",
    });

    return NextResponse.json({
      paymentIntentId: result.paymentIntentId,
      approvalUrl: result.approvalUrl,
    });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

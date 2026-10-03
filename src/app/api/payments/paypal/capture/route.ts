import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { orderAccessCookieName } from "@/server/auth/cookies";
import { createDb, getPool } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { paypalCaptureSchema } from "@/server/services/payment/payment-schemas";
import { capturePaypalPayment } from "@/server/services/payment/payment-intent-service";

/**
 * Captura server-side de una orden de PayPal ya aprobada por el cliente.
 * `paypalOrderId` NUNCA viene del cuerpo — sale de `payment_intents.provider_ref`.
 *
 * El token de invitado se resuelve de la cookie del pedido (mismo criterio
 * que `/api/result/[paymentIntentId]`, que corre en la misma pantalla justo
 * antes que esto) — `body.accessToken` se acepta todavía como respaldo por
 * si el cliente no llegó a mandar la cookie (ej. pestaña vieja de un deploy
 * anterior), pero el cliente propio ya dejó de mandarlo (auditoría de
 * seguridad, 2026-09-04).
 */
export async function POST(request: NextRequest) {
  try {
    const body = paypalCaptureSchema.parse(await request.json());
    const session = await getCurrentSession();

    const db = createDb(getPool());
    const { rows } = (await db.execute(
      sql`SELECT order_id FROM payment_intents WHERE id = ${body.paymentIntentId}::uuid`,
    )) as unknown as { rows: Array<{ order_id: string }> };
    const orderId = rows[0]?.order_id;

    const store = await cookies();
    const cookieToken = orderId ? store.get(orderAccessCookieName(orderId))?.value : undefined;

    const result = await capturePaypalPayment(getPool(), {
      paymentIntentId: body.paymentIntentId,
      accessToken: cookieToken ?? body.accessToken,
      userId: session?.userId,
    });

    return NextResponse.json({ status: result.status });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

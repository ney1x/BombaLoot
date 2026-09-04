import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { orderAccessCookieName } from "@/server/auth/cookies";
import { createDb, getPool } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { getPaymentResult } from "@/server/services/payment/result-service";

/**
 * Estado de un intento de pago, para la pantalla de resultado. Nunca
 * confía en el redirect del navegador como fuente de verdad — si el
 * webhook parece perdido, sincroniza contra el proveedor antes de
 * responder (ver `result-service.ts`).
 *
 * Este endpoint se poll ea en bucle mientras se espera la vuelta de
 * Wompi/PayPal (puede tardar minutos), así que era el mayor exponente del
 * hallazgo de la auditoría (token repetido en cada URL de la lista de
 * network). El token de invitado ahora se lee de la cookie del pedido —
 * resolviendo primero `order_id` desde `payment_intent_id` (lookup barato
 * por PK, `payment_intents.id` es un UUID aleatorio de 122 bits, no
 * enumerable — no es una exposición nueva, `getPaymentResult` ya hace este
 * mismo lookup internamente). El query string `?accessToken=` se mantiene
 * como respaldo TEMPORAL nada más: una pestaña ya abierta en el momento de
 * un deploy sigue con JS viejo que todavía lo manda mientras espera un pago
 * real en curso — cortarlo de golpe rompería ese pago. Sacar el fallback en
 * una limpieza posterior, una vez confirmado que ya no se usa.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ paymentIntentId: string }> }) {
  try {
    const { paymentIntentId } = await params;
    const session = await getCurrentSession();

    const db = createDb(getPool());
    const { rows } = (await db.execute(
      sql`SELECT order_id FROM payment_intents WHERE id = ${paymentIntentId}::uuid`,
    )) as unknown as { rows: Array<{ order_id: string }> };
    const orderId = rows[0]?.order_id;

    const store = await cookies();
    const cookieToken = orderId ? store.get(orderAccessCookieName(orderId))?.value : undefined;
    const accessToken = cookieToken ?? request.nextUrl.searchParams.get("accessToken") ?? undefined;

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

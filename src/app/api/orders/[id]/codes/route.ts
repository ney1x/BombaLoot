import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { orderAccessCookieName } from "@/server/auth/cookies";
import { getPool } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { deliverOrderCodes } from "@/server/services/payment/delivery-service";

/**
 * Entrega los códigos de un pedido ya pagado. El código nunca sale de la
 * base en claro hasta que el dueño del pedido lo pide explícitamente acá
 * — ni la confirmación del pago por sí sola lo revela.
 *
 * El token de invitado se lee de la cookie de acceso del pedido, nunca de
 * la URL (hallazgo de la auditoría de seguridad, 2026-09-04) — este
 * endpoint solo lo llama nuestro propio JS, nunca es un link que alguien
 * guarde, así que no necesita fallback por query string.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getCurrentSession();
    const store = await cookies();
    const accessToken = store.get(orderAccessCookieName(id))?.value;

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

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { orderAccessCookieName } from "@/server/auth/cookies";
import { getPool } from "@/server/db/client";
import { loadOwnedOrder } from "@/server/services/payment/order-access";
import { OrderNotFoundError } from "@/server/services/payment/errors";

/**
 * Detalle de un pedido — dueño autenticado (sesión) O invitado con la
 * cookie de acceso del pedido (`loadout_order_<id>`, plantada en el
 * checkout o al "promover" un link viejo en `/api/orders/token/[accessToken]`).
 * Antes esta ruta era solo de sesión; sin este cambio, un invitado nunca
 * dejaba de pegarle a la ruta por segmento de token para ver su propio
 * pedido (hallazgo de la auditoría de seguridad, 2026-09-04).
 *
 * IDOR: `loadOwnedOrder` ya cruza que el pedido resuelto por sesión O por
 * token sea efectivamente el pedido pedido — mismo error genérico
 * (`OrderNotFoundError` → 404) tanto si no existe como si no es tuyo, nunca
 * un 403 que confirme que el id es válido.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  const store = await cookies();
  const accessToken = store.get(orderAccessCookieName(id))?.value;

  try {
    const order = await loadOwnedOrder(getPool(), { orderId: id, accessToken, userId: session?.userId });
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    throw error;
  }
}

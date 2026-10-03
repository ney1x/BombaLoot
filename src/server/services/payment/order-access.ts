import "server-only";

import type { Pool } from "pg";
import { getOrderByAccessToken, getOrderForUser, type OrderView } from "../checkout-service";
import { OrderNotFoundError } from "./errors";

/**
 * Mismo criterio IDOR que el resto del checkout (fase 4): invitado prueba
 * dueño con `accessToken`, autenticado con `userId` de la sesión. Un pedido
 * ajeno da el mismo `OrderNotFoundError` que uno inexistente — nunca un
 * error que confirme que el id es válido pero no es tuyo.
 */
export async function loadOwnedOrder(
  pool: Pool,
  params: { orderId: string; accessToken?: string; userId?: string },
): Promise<OrderView> {
  let order: OrderView | null = null;
  if (params.userId) {
    order = await getOrderForUser(pool, params.userId, params.orderId);
  }
  if (!order && params.accessToken) {
    const byToken = await getOrderByAccessToken(pool, params.accessToken);
    if (byToken && byToken.orderId === params.orderId) order = byToken;
  }
  if (!order) throw new OrderNotFoundError();
  return order;
}

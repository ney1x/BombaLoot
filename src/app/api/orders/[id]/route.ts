import { NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { getOrderForUser } from "@/server/services/checkout-service";

/**
 * Detalle de un pedido para el dueño autenticado. IDOR: `getOrderForUser`
 * ya filtra por `user_id = session.userId` en la propia consulta — un
 * pedido ajeno da el mismo 404 que uno inexistente, nunca un 403 que
 * confirme que el id es válido pero no es tuyo.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const order = await getOrderForUser(getPool(), session.userId, id);

  if (!order) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ order });
}

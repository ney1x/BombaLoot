import { NextResponse } from "next/server";
import { getPool } from "@/server/db/client";
import { getOrderByAccessToken } from "@/server/services/checkout-service";

/**
 * Acceso de invitado a un pedido: poseer el token opaco de la URL es la
 * prueba de propiedad — el mismo mecanismo aprobado para `/pedido/[token]`
 * y para `claimGuestOrder`. `order_number` nunca sirve acá, a propósito.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accessToken: string }> },
) {
  const { accessToken } = await params;
  const order = await getOrderByAccessToken(getPool(), accessToken);

  if (!order) {
    return NextResponse.json({ error: "No encontramos un pedido con ese enlace" }, { status: 404 });
  }

  return NextResponse.json({ order });
}

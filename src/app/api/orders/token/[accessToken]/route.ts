import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/server/db/client";
import { getOrderByAccessToken } from "@/server/services/checkout-service";

/**
 * Acceso de invitado a un pedido: poseer el token opaco de la URL es la
 * prueba de propiedad — el mismo mecanismo aprobado para `/pedido/[token]`
 * y para `claimGuestOrder`. `order_number` nunca sirve acá, a propósito.
 *
 * `?email=` es opcional y solo lo manda el flujo de "recuperar desde el
 * historial" (`OrderDeliveryReal` en frío, sin la sesión de checkout viva)
 * — el flujo normal recién después de pagar no lo manda, así que no le
 * agrega fricción a nadie que ya está en su propia sesión. No es una
 * barrera de seguridad real (quien tiene el token ya probó posesión del
 * link); es fricción contra alguien que encontró el link solo, sin saber
 * el email de la compra.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accessToken: string }> },
) {
  const { accessToken } = await params;
  const email = request.nextUrl.searchParams.get("email")?.trim();
  const order = await getOrderByAccessToken(getPool(), accessToken);

  if (!order) {
    return NextResponse.json({ error: "No encontramos un pedido con ese enlace" }, { status: 404 });
  }

  if (email && order.email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "Ese email no coincide con el de la compra" }, { status: 403 });
  }

  return NextResponse.json({ order });
}

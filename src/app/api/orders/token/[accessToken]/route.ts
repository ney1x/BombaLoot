import { NextResponse, type NextRequest } from "next/server";
import { setOrderAccessCookie } from "@/server/auth/cookies";
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
 *
 * Es la única ruta que POR NECESIDAD sigue aceptando el token por URL — es
 * el arranque en frío (link/bookmark viejo, sin cookie todavía), igual que
 * un link de recuperación de contraseña. Lo que cambia (auditoría de
 * seguridad, 2026-09-04): una vez resuelto el pedido acá, se "promueve" el
 * token a una cookie httpOnly durable — de ahí en más el resto del flujo
 * deja de necesitar el token en la URL. Usa `NextResponse.cookies`, no
 * `next/headers cookies()`: `tests/order-recovery-route.test.ts` invoca este
 * `GET` directo, sin pasar por el request scope real de Next, y `cookies()`
 * de `next/headers` tira fuera de ese scope.
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

  const response = NextResponse.json({ order });
  setOrderAccessCookie(response.cookies, order.orderId, accessToken);
  return response;
}

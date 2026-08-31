import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/server/db/client";
import { claimOrderSchema } from "@/server/auth/schemas";
import { getCurrentSession } from "@/server/auth/guards";
import { apiErrorToResponse } from "@/server/http/respond";
import { claimGuestOrder } from "@/server/services/auth-service";

/**
 * Vincula un pedido de invitado a la cuenta logueada, usando el token
 * opaco del pedido como prueba de propiedad — el mismo mecanismo que ya da
 * acceso a `/pedido/[token]` sin cuenta.
 *
 * Requiere sesión: no tiene sentido "reclamar hacia" una cuenta que no
 * existe todavía. El flujo típico es completar el registro primero y
 * llamar esto después con el token que el usuario ya tenía en la mano
 * desde la pantalla de entrega.
 */
export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const body = claimOrderSchema.parse(await request.json());
    const result = await claimGuestOrder(getPool(), session.userId, body.accessToken);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

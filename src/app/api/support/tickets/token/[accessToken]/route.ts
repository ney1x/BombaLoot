import { NextResponse } from "next/server";
import { setTicketAccessCookie } from "@/server/auth/cookies";
import { getDb, getPool } from "@/server/db/client";
import { getTicketByAccessToken, listMessages } from "@/server/services/support-service";

/**
 * Acceso de invitado a la conversación: poseer el token opaco de la URL es
 * la prueba de propiedad — mismo mecanismo que `/api/orders/token/[accessToken]`.
 * Arranque en frío por necesidad (link viejo/guardado sin cookie todavía) —
 * al resolver acá, se "promueve" el token a una cookie httpOnly durable
 * (auditoría de seguridad, 2026-09-04), igual que el equivalente de pedidos.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accessToken: string }> },
) {
  const { accessToken } = await params;
  const ticket = await getTicketByAccessToken(getPool(), accessToken);

  if (!ticket) {
    return NextResponse.json({ error: "No encontramos una conversación con ese enlace" }, { status: 404 });
  }

  const messages = await listMessages(getDb(), ticket.id);
  const response = NextResponse.json({ ticket, messages });
  setTicketAccessCookie(response.cookies, ticket.id, accessToken);
  return response;
}

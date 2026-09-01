import { NextResponse } from "next/server";
import { getDb, getPool } from "@/server/db/client";
import { getTicketByAccessToken, listMessages } from "@/server/services/support-service";

/**
 * Acceso de invitado a la conversación: poseer el token opaco de la URL es
 * la prueba de propiedad — mismo mecanismo que `/api/orders/token/[accessToken]`.
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
  return NextResponse.json({ ticket, messages });
}

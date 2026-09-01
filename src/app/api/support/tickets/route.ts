import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { createSupportTicket, createTicketSchema } from "@/server/services/support-service";

/**
 * Crea un ticket de soporte. Público — funciona logueado o como invitado,
 * igual que el checkout. El invitado recibe el `accessToken` una sola vez
 * en la respuesta; es su única forma de volver a la conversación sin
 * cuenta, así que el cliente lo guarda de inmediato (URL + localStorage).
 */
export async function POST(request: NextRequest) {
  try {
    const body = createTicketSchema.parse(await request.json());
    const meta = requestMeta(request);
    const session = await getCurrentSession();

    const { ticket, accessToken } = await createSupportTicket(getPool(), body, {
      ip: meta.ip,
      userId: session?.userId ?? null,
    });

    return NextResponse.json({
      ticket: { id: ticket.id, ticketNumber: ticket.ticketNumber, status: ticket.status },
      accessToken,
    });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

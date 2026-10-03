import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { setTicketAccessCookie } from "@/server/auth/cookies";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { createSupportTicket, createTicketSchema } from "@/server/services/support-service";

/**
 * Crea un ticket de soporte. Público — funciona logueado o como invitado,
 * igual que el checkout. El invitado recibe el `accessToken` una sola vez
 * en la respuesta — `saveTicketRef` (client) lo sigue guardando en
 * localStorage para el atajo "volver a tu conversación" de `/ayuda` (eso no
 * cambia, ya documentado en la Política de Cookies). Lo que sí cambia
 * (auditoría de seguridad, 2026-09-04): de acá en más el acceso real de la
 * conversación lo lleva una cookie httpOnly plantada acá mismo, así que el
 * link a `/ayuda/ticket/[id]` deja de necesitar el token en la URL en el
 * uso normal.
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

    const response = NextResponse.json({
      ticket: { id: ticket.id, ticketNumber: ticket.ticketNumber, status: ticket.status },
      accessToken,
    });

    if (!session && accessToken) {
      setTicketAccessCookie(response.cookies, ticket.id, accessToken);
    }

    return response;
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { ticketAccessCookieName } from "@/server/auth/cookies";
import { getDb, getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import {
  addCustomerMessage,
  addCustomerMessageForUser,
  loadOwnedTicket,
  listMessages,
  supportMessageSchema,
} from "@/server/services/support-service";
import { SupportTicketNotFoundError } from "@/server/services/errors";

/**
 * Detalle de un ticket — dueño autenticado (sesión) O invitado con la
 * cookie de acceso del ticket (`loadout_ticket_<id>`, plantada al crear el
 * ticket o al "promover" un link viejo en `/api/support/tickets/token/[accessToken]`).
 * Antes esta ruta era solo de sesión; un invitado nunca dejaba de pegarle a
 * la ruta por segmento de token para ver su propia conversación — mismo
 * hallazgo que `/api/orders/[id]` (auditoría de seguridad, 2026-09-04).
 *
 * IDOR: `loadOwnedTicket` ya cruza que el ticket resuelto por sesión O por
 * token sea el pedido, mismo error genérico tanto si no existe como si no
 * es tuyo.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  const store = await cookies();
  const accessToken = store.get(ticketAccessCookieName(id))?.value;

  try {
    const ticket = await loadOwnedTicket(getPool(), { ticketId: id, accessToken, userId: session?.userId });
    const messages = await listMessages(getDb(), ticket.id);
    return NextResponse.json({ ticket, messages });
  } catch (error) {
    if (error instanceof SupportTicketNotFoundError) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }
    throw error;
  }
}

/** Responder — sesión logueada O cookie de acceso del ticket, misma prueba de propiedad que el GET de acá arriba. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getCurrentSession();
    const { body } = supportMessageSchema.parse(await request.json());
    const meta = requestMeta(request);

    let ticket;
    if (session) {
      ticket = await addCustomerMessageForUser(getPool(), session.userId, id, body, { ip: meta.ip });
    } else {
      const store = await cookies();
      const accessToken = store.get(ticketAccessCookieName(id))?.value;
      if (!accessToken) {
        return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
      }
      ticket = await addCustomerMessage(getPool(), accessToken, body, { ip: meta.ip });
    }

    const messages = await listMessages(getDb(), ticket.id);
    return NextResponse.json({ ticket, messages });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

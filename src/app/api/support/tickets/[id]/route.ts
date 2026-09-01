import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { addCustomerMessageForUser, getTicketForUser, listMessages, supportMessageSchema } from "@/server/services/support-service";

/**
 * Detalle de un ticket para el dueño autenticado — mismo criterio IDOR que
 * `/api/orders/[id]`: un ticket ajeno da el mismo 404 que uno inexistente.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const ticket = await getTicketForUser(getPool(), session.userId, id);
  if (!ticket) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const messages = await listMessages(getDb(), ticket.id);
  return NextResponse.json({ ticket, messages });
}

/** Responder sin token a mano — la sesión logueada es la prueba de propiedad. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { id } = await params;
    const { body } = supportMessageSchema.parse(await request.json());
    const meta = requestMeta(request);

    const ticket = await addCustomerMessageForUser(getPool(), session.userId, id, body, { ip: meta.ip });
    const messages = await listMessages(getDb(), ticket.id);
    return NextResponse.json({ ticket, messages });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

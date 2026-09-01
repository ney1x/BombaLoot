import { NextResponse, type NextRequest } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import {
  SupportTicketNotFoundError,
} from "@/server/services/errors";
import { getTicketAdmin, listMessages, supportTicketUpdateSchema, updateTicketAdmin } from "@/server/services/support-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrSupportApi();
    const { id } = await params;
    const db = getDb();
    const ticket = await getTicketAdmin(db, id);
    if (!ticket) throw new SupportTicketNotFoundError(id);

    const messages = await listMessages(db, id);
    return NextResponse.json({ ticket, messages });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

/** Cambiar estado y/o reasignar. Cualquiera de los dos roles puede — ninguno es ADMIN-only acá. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrSupportApi();
    const { id } = await params;
    const patch = supportTicketUpdateSchema.parse(await request.json());

    const ticket = await updateTicketAdmin(getDb(), id, patch);
    return NextResponse.json({ ticket });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

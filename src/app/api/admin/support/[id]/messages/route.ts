import { NextResponse, type NextRequest } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { addAdminMessage, listMessages, supportMessageSchema } from "@/server/services/support-service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminOrSupportApi();
    const { id } = await params;
    const { body } = supportMessageSchema.parse(await request.json());

    const ticket = await addAdminMessage(getPool(), id, session.userId, body);
    const messages = await listMessages(getDb(), id);
    return NextResponse.json({ ticket, messages });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

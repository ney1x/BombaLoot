import { NextResponse, type NextRequest } from "next/server";
import { getDb, getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { addCustomerMessage, listMessages, supportMessageSchema } from "@/server/services/support-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accessToken: string }> },
) {
  try {
    const { accessToken } = await params;
    const { body } = supportMessageSchema.parse(await request.json());
    const meta = requestMeta(request);

    const ticket = await addCustomerMessage(getPool(), accessToken, body, { ip: meta.ip });
    const messages = await listMessages(getDb(), ticket.id);
    return NextResponse.json({ ticket, messages });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

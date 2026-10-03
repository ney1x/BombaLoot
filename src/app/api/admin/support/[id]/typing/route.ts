import { NextResponse } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { getCustomerTyping, pingAdminTyping } from "@/server/services/support-service";

/** "¿Está escribiendo el cliente?" para el admin/SUPPORT. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrSupportApi();
    const { id } = await params;
    const typing = await getCustomerTyping(getDb(), id);
    return NextResponse.json({ typing });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrSupportApi();
    const { id } = await params;
    await pingAdminTyping(getDb(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

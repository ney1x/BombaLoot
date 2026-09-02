import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { suspendUser, unsuspendUser } from "@/server/services/admin-service";

const suspendSchema = z.object({
  reason: z.string().trim().min(5, "Contá brevemente por qué (mínimo 5 caracteres)").max(500),
});

/** ADMIN y SUPPORT pueden suspender/reactivar cuentas — ninguno puede tocar la suya ni la de un ADMIN (ver `suspendUser`). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminOrSupportApi();
    const { id } = await params;
    const { reason } = suspendSchema.parse(await request.json());
    await suspendUser(getPool(), actor, id, reason, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminOrSupportApi();
    const { id } = await params;
    await unsuspendUser(getPool(), actor, id, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { changeOrderEmail, changeOrderEmailSchema } from "@/server/services/admin-orders";

/**
 * Cambia el email al que llega el código de un pedido ya pagado. Exige
 * probar el número de pedido y el email original (`changeOrderEmail`
 * rechaza si no matchean, sin decir cuál de los dos falló) y un ticket de
 * soporte abierto sobre ese pedido — no es una acción libre del admin.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminOrSupportApi();
    const { id } = await params;
    const body = changeOrderEmailSchema.parse(await request.json());
    const result = await changeOrderEmail(getPool(), actor, id, body, requestMeta(request));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

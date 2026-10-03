import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { executeManualRefund, manualRefundSchema } from "@/server/services/admin-refunds";

/**
 * Confirma un reembolso manual REAL — nunca un botón "marcar como
 * completado" sin evidencia. Solo ADMIN (`requireAdminApi`): SUPPORT
 * llega hasta acá y recibe 403 antes de tocar el servicio. Ver
 * `admin-refunds.ts` para el detalle de qué valida y qué audita.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminApi();
    const { id } = await params;
    const input = manualRefundSchema.parse(await request.json());
    await executeManualRefund(getPool(), actor, id, input, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

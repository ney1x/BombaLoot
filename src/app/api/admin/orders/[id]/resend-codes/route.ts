import { NextResponse, type NextRequest } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { resendDeliveredCodesEmail } from "@/server/services/payment/delivery-service";

/**
 * Reenvía por email los códigos YA entregados de un pedido — para cuando el
 * correo original no llegó y el comprador no guardó el código. Nunca
 * devuelve el código en la respuesta; solo confirma que se mandó y a qué
 * dirección (para que soporte pueda verificarla con el comprador).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminOrSupportApi();
    const { id } = await params;
    const result = await resendDeliveredCodesEmail(getPool(), actor, id, requestMeta(request));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { adminDeliverOrderCodes } from "@/server/services/payment/delivery-service";

/**
 * Entrega manual: para un pedido ya `PAID` cuyo flujo normal del cliente en
 * `/pedido/[id]` nunca completó la entrega (token perdido, fetch fallido,
 * etc.) — sin esto, soporte no tiene forma de mandarle el código la primera
 * vez (`resend-codes` solo reenvía algo que ya se entregó antes). Nunca
 * devuelve el código en la respuesta; solo confirma que se mandó y a qué
 * dirección.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminOrSupportApi();
    const { id } = await params;
    const result = await adminDeliverOrderCodes(getPool(), actor, id, requestMeta(request));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

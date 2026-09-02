import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { cancelOrderForFraud } from "@/server/services/admin-orders";

const cancelSchema = z.object({
  reason: z.string().trim().min(5, "Contá brevemente por qué (mínimo 5 caracteres)").max(500),
});

/** Solo pedidos PENDING — uno ya pagado va por reembolsos, no por acá (ver `cancelOrderForFraud`). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminOrSupportApi();
    const { id } = await params;
    const { reason } = cancelSchema.parse(await request.json());
    const result = await cancelOrderForFraud(getPool(), actor, id, reason, requestMeta(request));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

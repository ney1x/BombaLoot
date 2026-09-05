import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireSuperAdminApi } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import {
  getPaymentFeeSettings,
  updatePaymentFeeSettings,
  updatePaymentFeeSettingsSchema,
} from "@/server/services/payment-fee-settings";

/**
 * Tarifa usada para ESTIMAR la comisión de Wompi (no expuesta por su API).
 * Cualquier ADMIN puede leerla; solo SUPERADMIN puede cambiarla — decide
 * qué tan confiable se ve el neto de cada admin en el dashboard, mismo
 * criterio que `code-lifecycle-settings`.
 */
export async function GET() {
  try {
    await requireAdminApi();
    const settings = await getPaymentFeeSettings(getDb());
    return NextResponse.json({ settings });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireSuperAdminApi();
    const input = updatePaymentFeeSettingsSchema.parse(await request.json());
    const settings = await updatePaymentFeeSettings(getPool(), actor, input, requestMeta(request));
    return NextResponse.json({ settings });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

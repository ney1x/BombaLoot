import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireSuperAdminApi } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import {
  getCodeLifecycleSettings,
  updateCodeLifecycleSettings,
  updateCodeLifecycleSettingsSchema,
} from "@/server/services/code-lifecycle-settings";

/**
 * Preferencias de vigencia de códigos y equidad entre admins. Cualquier
 * ADMIN puede leerlas; solo SUPERADMIN puede cambiarlas — deciden en parte a
 * quién se le vende el stock de quién, así que no las toca quien también
 * compite por ese reparto.
 */
export async function GET() {
  try {
    await requireAdminApi();
    const settings = await getCodeLifecycleSettings(getDb());
    return NextResponse.json({ settings });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireSuperAdminApi();
    const input = updateCodeLifecycleSettingsSchema.parse(await request.json());
    const settings = await updateCodeLifecycleSettings(getPool(), actor, input, requestMeta(request));
    return NextResponse.json({ settings });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

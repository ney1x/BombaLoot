import { NextResponse } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { getDashboardMetrics } from "@/server/services/admin-dashboard";
import { getHealthReport } from "@/server/services/admin-health";

/**
 * Dashboard admin: métricas de negocio + health operativo. ADMIN y SUPPORT
 * lo ven igual — es información, no una acción; las acciones sensibles que
 * puedan disparar desde acá (refund manual, editar producto) tienen su
 * propio guard más estricto en su propia ruta.
 */
export async function GET() {
  try {
    await requireAdminOrSupportApi();

    const [metrics, health] = await Promise.all([
      getDashboardMetrics(getDb()),
      getHealthReport(getPool()),
    ]);

    return NextResponse.json({ metrics, health });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

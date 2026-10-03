import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCronRequest } from "@/server/http/cron-auth";
import { getPool } from "@/server/db/client";
import { runReconciliationBatch } from "@/server/services/payment/reconciliation-service";

/**
 * Mismo trabajo que `npm run db:reconcile-payments` (fase 8). Corre cada
 * 10 minutos: nunca menos de `RECONCILE_STALE_MINUTES`
 * (`reconciliation-service.ts`), y con margen para que Neon alcance a
 * hacer scale-to-zero entre corridas (ver Proyecto.md §4).
 */
async function handler(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const result = await runReconciliationBatch(getPool());
  return NextResponse.json(result);
}

export const GET = handler;
export const POST = handler;

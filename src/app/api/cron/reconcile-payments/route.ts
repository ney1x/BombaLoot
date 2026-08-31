import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCronRequest } from "@/server/http/cron-auth";
import { getPool } from "@/server/db/client";
import { runReconciliationBatch } from "@/server/services/payment/reconciliation-service";

/**
 * Mismo trabajo que `npm run db:reconcile-payments` (fase 8). Recomendado
 * cada 5 minutos — coincide con `RECONCILE_STALE_MINUTES`
 * (`reconciliation-service.ts`): correr más seguido no encuentra nada
 * nuevo para conciliar antes de esa ventana.
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

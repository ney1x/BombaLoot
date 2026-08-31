import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCronRequest } from "@/server/http/cron-auth";
import { getPool } from "@/server/db/client";
import { runRefundWorkerBatch } from "@/server/services/payment/refund-service";

/**
 * Mismo trabajo que `npm run db:refund-worker`. El diseño original (fase 5)
 * lo pensaba corriendo cada ~10s — un scheduler externo gratuito casi nunca
 * permite un intervalo tan corto (la mayoría tiene un piso de 1 minuto).
 * Cada 1-2 minutos es razonable: `refund_requests` no es un flujo
 * sensible a la latencia de segundos, y el reintento automático de un
 * `REFUND_INITIATED` ya tiene su propia ventana de 5 min (ver
 * `refund-service.ts`).
 */
async function handler(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { processed } = await runRefundWorkerBatch(getPool());
  return NextResponse.json({ processed });
}

export const GET = handler;
export const POST = handler;

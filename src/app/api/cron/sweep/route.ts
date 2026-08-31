import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCronRequest } from "@/server/http/cron-auth";
import { createDb, getPool } from "@/server/db/client";
import { sweepExpiredReservations } from "@/server/services/inventory";
import { sweepExpiredPendingOrders } from "@/server/services/checkout-service";

/**
 * Mismo trabajo que `npm run db:sweep`, disparado por un scheduler externo
 * en vez de una terminal. Recomendado cada 1-2 minutos — es mantenimiento
 * (la corrección no depende de que esto corra, ver `inventory.ts`), así que
 * un intervalo más largo no rompe nada, solo deja códigos "atascados" un
 * rato más antes de liberarse.
 */
async function handler(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const pool = getPool();
  const reservations = await sweepExpiredReservations(createDb(pool));
  const orders = await sweepExpiredPendingOrders(pool);

  return NextResponse.json({
    reservations,
    orders,
  });
}

export const GET = handler;
export const POST = handler;

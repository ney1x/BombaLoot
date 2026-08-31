import { NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { listOrdersForUser } from "@/server/services/checkout-service";

/** Lista de pedidos del usuario logueado, para /cuenta/pedidos. */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const orders = await listOrdersForUser(getPool(), session.userId);
  return NextResponse.json({ orders });
}

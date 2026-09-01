import { NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { listTicketsForUser } from "@/server/services/support-service";

/** Lista de tickets del usuario logueado, para /cuenta/soporte. */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const tickets = await listTicketsForUser(getPool(), session.userId);
  return NextResponse.json({ tickets });
}

import { NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { getAdminTypingForUser, pingCustomerTypingForUser } from "@/server/services/support-service";

/** "¿Está escribiendo el admin?" para el cliente logueado sin token a mano — mismo criterio IDOR que `/api/support/tickets/[id]`. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const typing = await getAdminTypingForUser(getPool(), session.userId, id);
  return NextResponse.json({ typing });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const ok = await pingCustomerTypingForUser(getPool(), session.userId, id);
  if (!ok) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { ticketAccessCookieName } from "@/server/auth/cookies";
import { getPool } from "@/server/db/client";
import {
  getAdminTypingByToken,
  getAdminTypingForUser,
  pingCustomerTypingByToken,
  pingCustomerTypingForUser,
} from "@/server/services/support-service";

/**
 * "¿Está escribiendo el admin?" — sesión logueada O cookie de acceso del
 * ticket (invitado), mismo criterio IDOR que `/api/support/tickets/[id]`.
 * Este poll corre cada 2.5s mientras la conversación está abierta — era el
 * mayor exponente del token viajando por URL acá (auditoría de seguridad,
 * 2026-09-04), igual que `/api/result/[paymentIntentId]` para pedidos.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (session) {
    const typing = await getAdminTypingForUser(getPool(), session.userId, id);
    return NextResponse.json({ typing });
  }

  const store = await cookies();
  const accessToken = store.get(ticketAccessCookieName(id))?.value;
  if (!accessToken) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  const typing = await getAdminTypingByToken(getPool(), accessToken);
  return NextResponse.json({ typing });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();

  let ok: boolean;
  if (session) {
    ok = await pingCustomerTypingForUser(getPool(), session.userId, id);
  } else {
    const store = await cookies();
    const accessToken = store.get(ticketAccessCookieName(id))?.value;
    ok = accessToken ? await pingCustomerTypingByToken(getPool(), accessToken) : false;
  }

  if (!ok) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

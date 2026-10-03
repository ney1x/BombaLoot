import { NextResponse } from "next/server";
import { getPool } from "@/server/db/client";
import { getAdminTypingByToken, pingCustomerTypingByToken } from "@/server/services/support-service";

/** "¿Está escribiendo el admin?" para el invitado — mismo criterio de acceso que el resto de /token/[accessToken]: el token es la prueba de propiedad. */
export async function GET(_request: Request, { params }: { params: Promise<{ accessToken: string }> }) {
  const { accessToken } = await params;
  const typing = await getAdminTypingByToken(getPool(), accessToken);
  return NextResponse.json({ typing });
}

/** El invitado marca que está escribiendo. */
export async function POST(_request: Request, { params }: { params: Promise<{ accessToken: string }> }) {
  const { accessToken } = await params;
  const ok = await pingCustomerTypingByToken(getPool(), accessToken);
  if (!ok) return NextResponse.json({ error: "No encontramos una conversación con ese enlace" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

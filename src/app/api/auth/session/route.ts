import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { getCurrentSession } from "@/server/auth/guards";
import { touchSession } from "@/server/auth/session";

/**
 * Sesión actual, para el `AuthProvider` del cliente (Header, etc). El único
 * punto donde se actualiza `last_seen_at` — una vez por carga de página, no
 * en cada render de un Server Component.
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }

  await touchSession(getDb(), session.sessionId);

  return NextResponse.json({
    user: {
      name: session.name,
      email: session.email,
      role: session.role,
      purchasesCount: session.purchasesCount,
    },
  });
}

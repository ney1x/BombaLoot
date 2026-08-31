import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPool } from "@/server/db/client";
import { clearSessionCookie } from "@/server/auth/cookies";
import { getCurrentSession } from "@/server/auth/guards";
import { logoutUser } from "@/server/services/auth-service";

export async function POST() {
  const session = await getCurrentSession();
  const store = await cookies();

  if (session) {
    await logoutUser(getPool(), session.sessionId, session.userId);
  }

  clearSessionCookie(store);
  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/server/db/client";
import { changePasswordSchema } from "@/server/auth/schemas";
import { getCurrentSession } from "@/server/auth/guards";
import { apiErrorToResponse } from "@/server/http/respond";
import { changePassword } from "@/server/services/auth-service";

/** Requiere sesión activa — a diferencia del reset, que es para cuando NO se puede loguear. */
export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const body = changePasswordSchema.parse(await request.json());
    await changePassword(
      getPool(),
      session.userId,
      session.sessionId,
      body.currentPassword,
      body.newPassword,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

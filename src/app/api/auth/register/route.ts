import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getPool } from "@/server/db/client";
import { registerSchema } from "@/server/auth/schemas";
import { setSessionCookie } from "@/server/auth/cookies";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { registerUser } from "@/server/services/auth-service";

export async function POST(request: NextRequest) {
  try {
    const body = registerSchema.parse(await request.json());
    const meta = requestMeta(request);

    const { user, session } = await registerUser(
      getPool(),
      { name: body.name, email: body.email, password: body.password },
      meta,
      meta.ip,
    );

    const store = await cookies();
    // El registro deja logueado de una — siempre con la cookie persistente
    // (no hay checkbox "recordarme" en el formulario de alta).
    setSessionCookie(store, session.token, { remember: true });

    return NextResponse.json({
      user: { name: user.name, email: user.email, role: user.role, purchasesCount: user.purchasesCount },
    });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

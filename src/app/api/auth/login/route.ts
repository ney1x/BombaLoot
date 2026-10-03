import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getPool } from "@/server/db/client";
import { loginSchema } from "@/server/auth/schemas";
import { setSessionCookie } from "@/server/auth/cookies";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { loginUser } from "@/server/services/auth-service";

export async function POST(request: NextRequest) {
  try {
    const body = loginSchema.parse(await request.json());
    const meta = requestMeta(request);

    // Clave de rate limit combinada: email normalizado + IP. Solo por IP
    // dejaría bloquear a todos los que comparten una IP (oficina, NAT
    // universitario) por los intentos fallidos de uno; solo por email
    // dejaría a un atacante rotar de IP y seguir probando sobre la misma
    // cuenta sin límite.
    const rateLimitKey = `${body.email.trim().toLowerCase()}:${meta.ip}`;

    const { user, session } = await loginUser(
      getPool(),
      { email: body.email, password: body.password, remember: body.remember },
      meta,
      rateLimitKey,
    );

    const store = await cookies();
    setSessionCookie(store, session.token, { remember: body.remember });

    return NextResponse.json({
      user: { name: user.name, email: user.email, role: user.role, purchasesCount: user.purchasesCount },
    });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

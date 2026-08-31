import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getPool } from "@/server/db/client";
import { resetPasswordSchema } from "@/server/auth/schemas";
import { setSessionCookie } from "@/server/auth/cookies";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { resetPassword } from "@/server/services/auth-service";

export async function POST(request: NextRequest) {
  try {
    const body = resetPasswordSchema.parse(await request.json());
    const meta = requestMeta(request);

    const { session } = await resetPassword(getPool(), body.token, body.password, meta);

    const store = await cookies();
    setSessionCookie(store, session.token, { remember: true });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

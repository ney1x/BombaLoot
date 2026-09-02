import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getPool } from "@/server/db/client";
import { clearSessionCookie } from "@/server/auth/cookies";
import { getCurrentSession } from "@/server/auth/guards";
import { apiErrorToResponse } from "@/server/http/respond";
import { deleteOwnAccount } from "@/server/services/auth-service";

const deleteAccountSchema = z.object({ currentPassword: z.string().min(1) });

/** Autoservicio de "eliminar mi cuenta" — ver `deleteOwnAccount` para qué hace realmente (anonimiza, no borra). */
export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const { currentPassword } = deleteAccountSchema.parse(await request.json());
    await deleteOwnAccount(getPool(), session.userId, currentPassword);

    const store = await cookies();
    clearSessionCookie(store);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

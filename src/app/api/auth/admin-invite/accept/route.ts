import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { acceptAdminInvite } from "@/server/services/admin-service";

const acceptSchema = z.object({ token: z.string().trim().min(1) });

/**
 * Acepta una invitación a ADMIN. Requiere sesión (con cualquier rol) — no
 * tiene sentido "aceptar hacia" una cuenta que no existe todavía; quien
 * recibió el link primero inicia sesión o se registra con ese email.
 */
export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const { token } = acceptSchema.parse(await request.json());
    await acceptAdminInvite(getPool(), session, token, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

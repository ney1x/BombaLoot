import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/server/auth/guards";
import { emailSchema } from "@/server/auth/password";
import { getDb, getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { inviteAdmin, listPendingAdminInvites } from "@/server/services/admin-service";

const inviteSchema = z.object({ email: emailSchema });

/** Invitaciones a ADMIN pendientes — SUPERADMIN-only. */
export async function GET() {
  try {
    await requireSuperAdminApi();
    const invites = await listPendingAdminInvites(getDb());
    return NextResponse.json({ invites });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireSuperAdminApi();
    const { email } = inviteSchema.parse(await request.json());
    await inviteAdmin(getPool(), actor, email, requestMeta(request));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

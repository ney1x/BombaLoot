import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { setProductActive } from "@/server/services/admin-products";

const bodySchema = z.object({ isActive: z.boolean() });

/**
 * Único "borrado" de producto que existe: desactivarlo. Nunca hay un
 * DELETE físico — ver 0006_admin_products.sql.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminApi();
    const { id } = await params;
    const { isActive } = bodySchema.parse(await request.json());
    await setProductActive(getPool(), actor, id, isActive, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

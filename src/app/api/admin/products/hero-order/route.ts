import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { setHeroOrder, setHeroOrderSchema } from "@/server/services/admin-products";

/** Reescribe el orden de rotación del hero de Home para todos los productos listados — ADMIN-only. */
export async function PUT(request: NextRequest) {
  try {
    const actor = await requireAdminApi();
    const { productIds } = setHeroOrderSchema.parse(await request.json());
    await setHeroOrder(getPool(), actor, productIds, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { TargetUserNotFoundError } from "@/server/auth/errors";
import { getUserDetailAdmin } from "@/server/services/admin-users";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrSupportApi();
    const { id } = await params;
    const user = await getUserDetailAdmin(getDb(), id);
    if (!user) throw new TargetUserNotFoundError();
    return NextResponse.json({ user });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

import { NextResponse } from "next/server";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { apiErrorToResponse } from "@/server/http/respond";

/**
 * Confirma sesión administrativa y devuelve el rol real (resuelto en
 * servidor, nunca el que mandó el cliente). ADMIN y SUPPORT llegan acá por
 * igual — es el endpoint "de piso" que cualquier vista admin puede llamar,
 * sin acciones sensibles de por medio.
 */
export async function GET() {
  try {
    const session = await requireAdminOrSupportApi();
    return NextResponse.json({
      user: { id: session.userId, email: session.email, name: session.name, role: session.role },
    });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

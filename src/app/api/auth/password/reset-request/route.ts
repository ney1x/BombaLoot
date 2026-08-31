import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/server/db/client";
import { resetRequestSchema } from "@/server/auth/schemas";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { requestPasswordReset } from "@/server/services/auth-service";

const GENERIC_MESSAGE =
  "Si existe una cuenta con ese email, te enviamos instrucciones para recuperar tu contraseña.";

export async function POST(request: NextRequest) {
  try {
    const body = resetRequestSchema.parse(await request.json());
    const meta = requestMeta(request);

    await requestPasswordReset(getPool(), body.email, `${body.email.trim().toLowerCase()}:${meta.ip}`);

    // SIEMPRE la misma respuesta, exista o no la cuenta — ver el
    // comentario de `requestPasswordReset` sobre por qué el trabajo interno
    // también se equipara entre ambos casos.
    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    // Ojo: el rate limit sí puede distinguirse (429), a propósito — no es
    // información sobre si el email existe, es sobre cuántas veces
    // preguntaron.
    return apiErrorToResponse(error);
  }
}

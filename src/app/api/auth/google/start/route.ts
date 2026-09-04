import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { buildGoogleAuthUrl, createOAuthState, createPkce } from "@/server/auth/google";
import { setGoogleOAuthCookie } from "@/server/auth/cookies";

/** Nunca un `next`/`claim` que salga del propio sitio — mismo criterio que cualquier redirect post-login. */
function sanitizeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/cuenta";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const next = sanitizeNextPath(searchParams.get("next"));
  const claim = searchParams.get("claim");

  const state = createOAuthState();
  const { verifier, challenge } = createPkce();

  let authUrl: string;
  try {
    // Sin GOOGLE_CLIENT_ID/SECRET configuradas todavía (falta el paso en
    // Google Cloud Console) esto tira acá, antes de escribir la cookie —
    // falla a un mensaje legible en vez de un 500 crudo.
    authUrl = buildGoogleAuthUrl(state, challenge);
  } catch (error) {
    console.error("[auth] Google OAuth no configurado:", error);
    return NextResponse.redirect(new URL("/cuenta/login?error=google_not_configured", request.url));
  }

  const store = await cookies();
  setGoogleOAuthCookie(store, { state, codeVerifier: verifier, next, claim: claim ?? undefined });

  return NextResponse.redirect(authUrl);
}

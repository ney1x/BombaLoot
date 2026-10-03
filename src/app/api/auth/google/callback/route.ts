import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getPool } from "@/server/db/client";
import {
  clearGoogleOAuthCookie,
  GOOGLE_OAUTH_COOKIE_NAME,
  setSessionCookie,
  type GoogleOAuthState,
} from "@/server/auth/cookies";
import { exchangeGoogleCode } from "@/server/auth/google";
import { AccountSuspendedError, GoogleAuthError } from "@/server/auth/errors";
import { requestMeta } from "@/server/http/request-meta";
import { claimGuestOrder, loginOrRegisterWithGoogle } from "@/server/services/auth-service";

/**
 * Callback de Google. Nunca devuelve JSON — siempre redirige, a `next`
 * (éxito) o a `/cuenta/login?error=...` (cualquier falla), igual que un
 * link de reset de contraseña. El detalle real de una falla va a
 * `console.error`, nunca a la URL.
 */
export async function GET(request: NextRequest) {
  const store = await cookies();
  const raw = store.get(GOOGLE_OAUTH_COOKIE_NAME)?.value;
  clearGoogleOAuthCookie(store);

  const url = new URL(request.url);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const loginUrl = (error: string) => NextResponse.redirect(new URL(`/cuenta/login?error=${error}`, appUrl));

  // El usuario canceló o rechazó permisos en la pantalla de Google — no es
  // una falla nuestra, no hace falta loguear nada.
  if (url.searchParams.get("error")) {
    return loginUrl("google_cancelled");
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  if (!code || !returnedState || !raw) {
    return loginUrl("google_failed");
  }

  let saved: GoogleOAuthState;
  try {
    saved = JSON.parse(raw) as GoogleOAuthState;
  } catch {
    return loginUrl("google_failed");
  }

  // El `state` no viajó firmado — la garantía es que solo alguien que
  // arrancó el flujo desde acá (y por lo tanto tiene esta cookie) puede
  // hacerlo coincidir. Un mismatch es CSRF o una cookie de un intento viejo.
  if (returnedState !== saved.state) {
    return loginUrl("google_failed");
  }

  try {
    const profile = await exchangeGoogleCode(code, saved.codeVerifier);
    const meta = requestMeta(request);
    const { user, session } = await loginOrRegisterWithGoogle(getPool(), profile, meta);

    // Igual que el registro con contraseña: siempre queda logueado con la
    // cookie persistente, no hay checkbox "recordarme" en este flujo.
    setSessionCookie(store, session.token, { remember: true });

    if (saved.claim) {
      // Best-effort, igual que el registro por formulario: si falla, la
      // cuenta ya quedó creada y logueada — el pedido se vincula después.
      await claimGuestOrder(getPool(), user.id, saved.claim).catch(() => {});
    }

    return NextResponse.redirect(new URL(saved.next, appUrl));
  } catch (error) {
    if (error instanceof AccountSuspendedError) {
      return loginUrl("account_suspended");
    }
    if (!(error instanceof GoogleAuthError)) {
      console.error("[auth] google callback error:", error);
    }
    return loginUrl("google_failed");
  }
}

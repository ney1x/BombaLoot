import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { GoogleAuthError } from "./errors";

/**
 * OAuth 2.0 Authorization Code con PKCE contra Google. Sin `next-auth` ni
 * `google-auth-library` — mismo criterio que el resto de `auth/`: pocas
 * dependencias, primitivas propias. No hace falta verificar la firma del
 * `id_token` a mano: se llama al userinfo endpoint de Google directamente
 * con el `access_token` recién canjeado, así la autenticidad la da el
 * propio canal HTTPS servidor-a-servidor con Google, no una verificación
 * JWT/JWKS propia.
 *
 * PKCE es opcional para un cliente confidencial (tiene `client_secret`) —
 * se agrega igual como capa extra contra interceptación del código de
 * autorización, mismo criterio defensivo que el resto de este módulo.
 */

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export interface GooglePkce {
  verifier: string;
  challenge: string;
}

export function createPkce(): GooglePkce {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Token anti-CSRF del propio ida-y-vuelta OAuth — nada que ver con las sesiones de `tokens.ts` (no autoriza nada por sí solo, solo confirma que el callback corresponde a un `start` propio). */
export function createOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta ${name} — configurá las credenciales de Google OAuth en .env.local`);
  }
  return value;
}

function redirectUri(): string {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return `${appUrl}/api/auth/google/callback`;
}

export function buildGoogleAuthUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "online",
    // Fuerza el selector de cuenta en vez de reusar en silencio una sesión
    // de Google ya abierta en el navegador — menos sorpresas sobre con qué
    // cuenta se está entrando.
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleProfile {
  /** `sub` — id estable de la cuenta de Google, nunca el email. */
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/** Canjea el código de autorización por el perfil de Google. Único punto que habla con la red de Google en todo el flujo. */
export async function exchangeGoogleCode(code: string, codeVerifier: string): Promise<GoogleProfile> {
  let tokenRes: Response;
  try {
    tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: requireEnv("GOOGLE_CLIENT_ID"),
        client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
        code,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
    });
  } catch (error) {
    console.error("[auth] no se pudo contactar el token endpoint de Google:", error);
    throw new GoogleAuthError();
  }

  if (!tokenRes.ok) {
    console.error("[auth] Google rechazó el intercambio de código:", tokenRes.status, await tokenRes.text());
    throw new GoogleAuthError();
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) throw new GoogleAuthError();

  const userRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) {
    console.error("[auth] Google rechazó la consulta de userinfo:", userRes.status);
    throw new GoogleAuthError();
  }

  const profile = (await userRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (!profile.sub || !profile.email) throw new GoogleAuthError();

  return {
    googleId: profile.sub,
    email: profile.email,
    emailVerified: profile.email_verified ?? false,
    name: profile.name ?? null,
  };
}

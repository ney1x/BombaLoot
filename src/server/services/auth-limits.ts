import "server-only";

/**
 * Límites de abuso para el flujo de autenticación, centralizados igual que
 * `reservation-limits.ts` — un solo lugar, configurable por env, nunca un
 * número suelto copiado en cada endpoint.
 */
export interface AuthLimits {
  /** Login: intentos permitidos por combinación email+IP en la ventana. */
  loginMaxPerWindow: number;
  loginWindowSeconds: number;
  /** Registro: cuentas nuevas permitidas por IP en la ventana. */
  registerMaxPerWindow: number;
  registerWindowSeconds: number;
  /** Recuperación de contraseña: solicitudes permitidas por email+IP. */
  resetRequestMaxPerWindow: number;
  resetRequestWindowSeconds: number;
  /**
   * Cambio de contraseña (logueado): intentos permitidos por usuario en la
   * ventana. A diferencia del resto, key por `userId` y no por IP+algo —
   * quien lo intenta ya tiene una sesión válida (robada o no), así que
   * limitar por cuenta importa más que por origen de red.
   */
  changePasswordMaxPerWindow: number;
  changePasswordWindowSeconds: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const AUTH_LIMITS: AuthLimits = {
  loginMaxPerWindow: envInt("AUTH_LOGIN_MAX_PER_WINDOW", 8),
  loginWindowSeconds: envInt("AUTH_LOGIN_WINDOW_SECONDS", 300),
  registerMaxPerWindow: envInt("AUTH_REGISTER_MAX_PER_WINDOW", 5),
  registerWindowSeconds: envInt("AUTH_REGISTER_WINDOW_SECONDS", 3600),
  resetRequestMaxPerWindow: envInt("AUTH_RESET_MAX_PER_WINDOW", 5),
  resetRequestWindowSeconds: envInt("AUTH_RESET_WINDOW_SECONDS", 3600),
  changePasswordMaxPerWindow: envInt("AUTH_CHANGE_PASSWORD_MAX_PER_WINDOW", 8),
  changePasswordWindowSeconds: envInt("AUTH_CHANGE_PASSWORD_WINDOW_SECONDS", 300),
};

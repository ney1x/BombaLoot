import "server-only";

/**
 * IP y user-agent del request, para auditoría y para las claves de rate
 * limit. `NextRequest` ya no expone `.ip` (Vercel lo sacó de la API hace
 * varias versiones) — el reemplazo documentado es leer `x-forwarded-for`
 * a mano. En local, sin proxy delante, esto va a resolver a `unknown` o a
 * la IP del propio Node — es esperable y no bloquea el flujo (el rate
 * limiter simplemente agrupa todo bajo la misma clave en dev).
 *
 * Asunción de despliegue (hallazgo de auditoría de seguridad,
 * 2026-09-02): esto asume que el proyecto corre detrás del edge de
 * Vercel, que fija `x-forwarded-for` de forma confiable y no deja pasar
 * el valor que un cliente arbitrario intente inyectar. Si el despliegue
 * cambia a otro hosting/proxy sin esa garantía, un cliente podría
 * falsificar este header y evadir el rate-limit por IP — no hay una
 * lista de proxies confiables acá porque agregarla sin necesidad real
 * hoy sería complejidad sin uso.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}

export function getUserAgent(request: Request): string | null {
  return request.headers.get("user-agent");
}

export function requestMeta(request: Request): { ip: string; userAgent: string | null } {
  return { ip: getClientIp(request), userAgent: getUserAgent(request) };
}

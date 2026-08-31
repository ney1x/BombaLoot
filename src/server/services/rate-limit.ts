import "server-only";

/**
 * Rate limiter de ventana deslizante, en memoria, por clave arbitraria
 * (IP, userId, guestKey, o una combinación).
 *
 * Limitación conocida y deliberada: vive en memoria del proceso. Sirve tal
 * cual para el Postgres local y para un único contenedor Node persistente
 * (la opción de infraestructura que se decidió para el MVP). En Vercel
 * serverless cada invocación es un proceso nuevo, así que esto NO limita
 * nada entre invocaciones — hace falta un store compartido (Upstash Redis
 * es la opción usual con Vercel) antes de desplegar ahí. La interfaz de
 * abajo (`checkRateLimit`) es la que fase 4 conecta a las rutas HTTP; el día
 * que haga falta, se cambia la implementación interna sin tocar quien la
 * llama.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export class RateLimitExceededError extends Error {
  readonly code = "RATE_LIMIT_EXCEEDED";

  constructor(
    readonly key: string,
    readonly limit: number,
    readonly windowSeconds: number,
  ) {
    super(`Rate limit excedido para "${key}": ${limit} intentos por ${windowSeconds}s`);
    this.name = "RateLimitExceededError";
  }
}

/**
 * Registra un intento bajo `key` y lanza `RateLimitExceededError` si supera
 * `max` intentos dentro de los últimos `windowSeconds`. No lanza: el intento
 * queda registrado igual.
 */
export function checkRateLimit(key: string, max: number, windowSeconds: number): void {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const bucket = buckets.get(key) ?? { hits: [] };

  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  bucket.hits.push(now);
  buckets.set(key, bucket);

  if (bucket.hits.length > max) {
    throw new RateLimitExceededError(key, max, windowSeconds);
  }
}

/** Solo para tests: vacía todos los buckets entre casos. */
export function resetRateLimits(): void {
  buckets.clear();
}

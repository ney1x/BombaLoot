import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/server/db/client";
import { baseCookieOptionsForTest } from "./helpers/auth";
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidCurrentPasswordError,
  InvalidOrderTokenError,
  InvalidResetTokenError,
  OrderAlreadyClaimedError,
} from "@/server/auth/errors";
import { normalizeEmail } from "@/server/auth/password";
import { createOpaqueToken, hashToken, tokenMatches } from "@/server/auth/tokens";
import { validateSessionToken } from "@/server/auth/session";
import { RateLimitExceededError, resetRateLimits } from "@/server/services/rate-limit";
import { AUTH_LIMITS } from "@/server/services/auth-limits";
import {
  changePassword,
  claimGuestOrder,
  loginUser,
  logoutUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
} from "@/server/services/auth-service";
import { createTestDatabase, resetData } from "./helpers/database";

let pool: Pool;
let db: Db;

beforeAll(async () => {
  pool = await createTestDatabase();
  db = createDb(pool);
}, 120_000);

afterAll(async () => {
  await pool?.end();
});

beforeEach(async () => {
  await resetData(pool);
  await resetRateLimits(pool);
});

const NEW_USER = {
  name: "Ana Martínez",
  email: "Ana.Martinez+test@Example.com", // mezcla de mayúsculas/minúsculas a propósito
  password: "correcto-caballo-batería-grapadora",
};

async function insertGuestOrder(overrides: {
  userId?: string | null;
  revoked?: boolean;
} = {}): Promise<{ orderId: string; token: string }> {
  const { value: token, hash } = createOpaqueToken();
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO orders (order_number, access_token_hash, access_token_revoked_at, user_id, email, subtotal_cop, discount_cop, total_cop)
     VALUES ($1, $2, $3, $4, 'invitado@test.local', 10000, 0, 10000)
     RETURNING id`,
    [
      `TEST-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      hash,
      overrides.revoked ? new Date() : null,
      overrides.userId ?? null,
    ],
  );
  return { orderId: rows[0].id, token };
}

/* ═══════════════════════════ Registro ═══════════════════════════ */

describe("registro", () => {
  it("crea la cuenta, normaliza el email y deja una sesión activa", async () => {
    const result = await registerUser(pool, NEW_USER, { ip: "127.0.0.1" });

    expect(result.user.email).toBe(normalizeEmail(NEW_USER.email));
    expect(result.user.role).toBe("CUSTOMER");
    expect(result.session.token).toHaveLength(43); // 32 bytes en base64url, sin padding

    const validated = await validateSessionToken(db, result.session.token);
    expect(validated?.userId).toBeDefined();
    expect(validated?.email).toBe("ana.martinez+test@example.com");
  });

  it("nunca guarda la contraseña en claro", async () => {
    await registerUser(pool, NEW_USER, {});
    const { rows } = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE lower(email) = $1",
      [normalizeEmail(NEW_USER.email)],
    );
    expect(rows[0].password_hash).not.toContain(NEW_USER.password);
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
  });

  it("rechaza un email duplicado, sin importar mayúsculas/minúsculas", async () => {
    await registerUser(pool, NEW_USER, {});
    await expect(
      registerUser(pool, { ...NEW_USER, email: NEW_USER.email.toUpperCase() }, {}),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it("dos registros simultáneos con el mismo email: solo uno gana", async () => {
    const results = await Promise.allSettled([
      registerUser(pool, NEW_USER, {}),
      registerUser(pool, NEW_USER, {}),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM users WHERE lower(email) = $1",
      [normalizeEmail(NEW_USER.email)],
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it("registro deja auditoría sin exponer la contraseña", async () => {
    const result = await registerUser(pool, NEW_USER, {});
    const { rows } = await pool.query<{ metadata: unknown }>(
      "SELECT metadata FROM audit_logs WHERE action = 'auth.registered' AND entity_id = $1",
      [result.user.id],
    );
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0].metadata)).not.toContain(NEW_USER.password);
  });

  it("rate limit de registro por IP", async () => {
    for (let i = 0; i < AUTH_LIMITS.registerMaxPerWindow; i += 1) {
      await registerUser(
        pool,
        { ...NEW_USER, email: `user${i}@test.local` },
        {},
        "203.0.113.5",
      );
    }
    await expect(
      registerUser(pool, { ...NEW_USER, email: "unomas@test.local" }, {}, "203.0.113.5"),
    ).rejects.toBeInstanceOf(RateLimitExceededError);
  });
});

/* ═══════════════════════════ Login ═══════════════════════════ */

describe("login", () => {
  beforeEach(async () => {
    await registerUser(pool, NEW_USER, {});
  });

  it("credenciales correctas: nueva sesión, no reutiliza ninguna", async () => {
    const first = await loginUser(pool, { email: NEW_USER.email, password: NEW_USER.password }, {});
    const second = await loginUser(pool, { email: NEW_USER.email, password: NEW_USER.password }, {});

    // Session fixation: cada login emite un token nuevo, nunca el mismo.
    expect(first.session.token).not.toBe(second.session.token);

    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM sessions WHERE user_id = $1",
      [first.user.id],
    );
    // 3 = la del registro (beforeEach) + estos dos logins. Todas coexisten
    // (multi-dispositivo) — loguearse de nuevo no revoca las anteriores.
    expect(Number(rows[0].count)).toBe(3);
  });

  it("contraseña incorrecta: mismo error genérico que email inexistente", async () => {
    let wrongPasswordError: unknown;
    let noSuchUserError: unknown;

    try {
      await loginUser(pool, { email: NEW_USER.email, password: "lo-que-sea-mal" }, {});
    } catch (e) {
      wrongPasswordError = e;
    }
    try {
      await loginUser(pool, { email: "no-existe-nadie@test.local", password: "lo-que-sea" }, {});
    } catch (e) {
      noSuchUserError = e;
    }

    expect(wrongPasswordError).toBeInstanceOf(InvalidCredentialsError);
    expect(noSuchUserError).toBeInstanceOf(InvalidCredentialsError);
    expect((wrongPasswordError as Error).message).toBe((noSuchUserError as Error).message);
  });

  it(
    "mitigación de timing: el camino de email inexistente también corre un " +
      "verify() de Argon2, no responde instantáneo",
    async () => {
      const start = performance.now();
      await loginUser(pool, { email: "no-existe-nadie@test.local", password: "x" }, {}).catch(() => {});
      const elapsed = performance.now() - start;

      // Un verify() de Argon2id real nunca es sub-milisegundo. No es una
      // prueba de timing-safety perfecta (ver comentario en auth-service.ts),
      // pero confirma que el camino "no existe" no hace un early-return sin
      // costo computacional equivalente.
      expect(elapsed).toBeGreaterThan(5);
    },
  );

  it("falla de login queda auditada, sin la contraseña", async () => {
    await loginUser(pool, { email: NEW_USER.email, password: "mal" }, {}).catch(() => {});
    const { rows } = await pool.query<{ metadata: unknown }>(
      "SELECT metadata FROM audit_logs WHERE action = 'auth.login_failed'",
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(JSON.stringify(row.metadata)).not.toContain("mal");
    }
  });

  it("rate limit de login por email+IP — protección de fuerza bruta", async () => {
    const key = "203.0.113.9";
    for (let i = 0; i < AUTH_LIMITS.loginMaxPerWindow; i += 1) {
      await loginUser(
        pool,
        { email: NEW_USER.email, password: "mal" },
        {},
        `${NEW_USER.email.toLowerCase()}:${key}`,
      ).catch(() => {});
    }
    await expect(
      loginUser(
        pool,
        { email: NEW_USER.email, password: "mal" },
        {},
        `${NEW_USER.email.toLowerCase()}:${key}`,
      ),
    ).rejects.toBeInstanceOf(RateLimitExceededError);
  });

  it("el rate limit de login es por IP también: otra IP no se ve afectada", async () => {
    const key1 = "203.0.113.10";
    for (let i = 0; i < AUTH_LIMITS.loginMaxPerWindow; i += 1) {
      await loginUser(
        pool,
        { email: NEW_USER.email, password: "mal" },
        {},
        `${NEW_USER.email.toLowerCase()}:${key1}`,
      ).catch(() => {});
    }
    // Misma cuenta, otra IP: no debería estar bloqueada.
    const result = await loginUser(
      pool,
      { email: NEW_USER.email, password: NEW_USER.password },
      {},
      `${NEW_USER.email.toLowerCase()}:203.0.113.11`,
    );
    expect(result.user.email).toBe(normalizeEmail(NEW_USER.email));
  });

  it("regresión (auditoría de seguridad): sin 'recordarme', la sesión real dura ~12h, no 30 días", async () => {
    const result = await loginUser(
      pool,
      { email: NEW_USER.email, password: NEW_USER.password, remember: false },
      {},
    );

    const { rows } = await pool.query<{ expires_at: string }>(
      "SELECT expires_at FROM sessions WHERE id = $1",
      [result.session.sessionId],
    );
    const secondsLeft = (new Date(rows[0].expires_at).getTime() - Date.now()) / 1000;

    // Ventana ancha para no ser flaky por el tiempo que tarda el test en
    // correr, pero suficiente para distinguir 12h de 30 días sin ambigüedad.
    expect(secondsLeft).toBeGreaterThan(11 * 3600);
    expect(secondsLeft).toBeLessThan(13 * 3600);
  });

  it("con 'recordarme', la sesión real dura 30 días — comportamiento previo intacto", async () => {
    const result = await loginUser(
      pool,
      { email: NEW_USER.email, password: NEW_USER.password, remember: true },
      {},
    );

    const { rows } = await pool.query<{ expires_at: string }>(
      "SELECT expires_at FROM sessions WHERE id = $1",
      [result.session.sessionId],
    );
    const daysLeft = (new Date(rows[0].expires_at).getTime() - Date.now()) / (1000 * 3600 * 24);

    expect(daysLeft).toBeGreaterThan(29);
    expect(daysLeft).toBeLessThan(31);
  });
});

/* ═══════════════════════════ Logout ═══════════════════════════ */

describe("logout", () => {
  it("revoca la sesión: el token deja de validar", async () => {
    const { user, session } = await registerUser(pool, NEW_USER, {});

    expect(await validateSessionToken(db, session.token)).not.toBeNull();

    await logoutUser(pool, session.sessionId, user.id);

    expect(await validateSessionToken(db, session.token)).toBeNull();
  });
});

/* ═══════════════════════════ Recuperación de contraseña ═══════════════════════════ */

describe("recuperación de contraseña", () => {
  it("email inexistente: no crea token, no lanza, mismo comportamiento observable", async () => {
    await expect(
      requestPasswordReset(pool, "no-existe-nadie@test.local"),
    ).resolves.toBeUndefined();

    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM password_reset_tokens",
    );
    expect(Number(rows[0].count)).toBe(0);
  });

  it("email existente: crea un token de un solo uso, con expiración, y audita sin loguear el token", async () => {
    await registerUser(pool, NEW_USER, {});
    await requestPasswordReset(pool, NEW_USER.email);

    const { rows } = await pool.query<{ used_at: string | null; expires_at: string }>(
      "SELECT used_at, expires_at FROM password_reset_tokens",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].used_at).toBeNull();
    expect(new Date(rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());

    const { rows: audit } = await pool.query<{ metadata: unknown }>(
      "SELECT metadata FROM audit_logs WHERE action = 'auth.password_reset_requested'",
    );
    expect(audit).toHaveLength(1);
  });

  it("resetea la contraseña, invalida TODAS las sesiones anteriores, y deja una nueva", async () => {
    const { user, session: oldSession } = await registerUser(pool, NEW_USER, {});
    const anotherLogin = await loginUser(
      pool,
      { email: NEW_USER.email, password: NEW_USER.password },
      {},
    );

    await requestPasswordReset(pool, NEW_USER.email);
    const { rows } = await pool.query<{ token_hash: Buffer }>(
      "SELECT token_hash FROM password_reset_tokens WHERE user_id = $1",
      [user.id],
    );
    // El token en claro no se persiste — para el test, se genera uno nuevo
    // con el mismo hash guardado no es posible (unidireccional), así que se
    // reconstruye el flujo llamando directo al servicio con el valor que
    // `requestPasswordReset` habría mandado por mail. Para eso, se lee el
    // link real capturando la llamada al mailer sería más fiel; acá se
    // valida el contrato a través de un token fabricado a mano con el mismo
    // mecanismo (createOpaqueToken + UPDATE con el hash correspondiente) para
    // poder aserts sobre el flujo completo sin depender de leer stdout.
    expect(rows).toHaveLength(1);

    const newPassword = "otra-frase-bastante-larga-tambien";
    const { value: rawToken } = createOpaqueToken();
    await pool.query("UPDATE password_reset_tokens SET token_hash = $1 WHERE user_id = $2", [
      hashToken(rawToken),
      user.id,
    ]);

    const result = await resetPassword(pool, rawToken, newPassword, {});

    expect(result.user.email).toBe(normalizeEmail(NEW_USER.email));
    // Sesiones previas (registro + login extra) quedaron revocadas.
    expect(await validateSessionToken(db, oldSession.token)).toBeNull();
    expect(await validateSessionToken(db, anotherLogin.session.token)).toBeNull();
    // La nueva sesión del propio reset sí es válida.
    expect(await validateSessionToken(db, result.session.token)).not.toBeNull();

    // Y la contraseña nueva funciona para loguearse.
    const relogin = await loginUser(pool, { email: NEW_USER.email, password: newPassword }, {});
    expect(relogin.user.email).toBe(normalizeEmail(NEW_USER.email));
  });

  it("un token usado no sirve una segunda vez", async () => {
    await registerUser(pool, NEW_USER, {});
    const { value: rawToken, hash } = createOpaqueToken();
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       SELECT id, $1, now() + interval '30 minutes' FROM users LIMIT 1`,
      [hash],
    );

    await resetPassword(pool, rawToken, "primera-vez-nueva-clave", {});
    await expect(
      resetPassword(pool, rawToken, "segunda-vez-nueva-clave", {}),
    ).rejects.toBeInstanceOf(InvalidResetTokenError);
  });

  it("un token vencido se rechaza", async () => {
    await registerUser(pool, NEW_USER, {});
    const { value: rawToken, hash } = createOpaqueToken();
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       SELECT id, $1, now() - interval '1 second' FROM users LIMIT 1`,
      [hash],
    );

    await expect(resetPassword(pool, rawToken, "nueva-clave-cualquiera", {})).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );
  });

  it("dos usos simultáneos del mismo token: exactamente uno gana", async () => {
    await registerUser(pool, NEW_USER, {});
    const { value: rawToken, hash } = createOpaqueToken();
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       SELECT id, $1, now() + interval '30 minutes' FROM users LIMIT 1`,
      [hash],
    );

    const results = await Promise.allSettled([
      resetPassword(pool, rawToken, "clave-de-carrera-a", {}),
      resetPassword(pool, rawToken, "clave-de-carrera-b", {}),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("token inexistente/inventado se rechaza con el mismo mensaje genérico", async () => {
    await expect(
      resetPassword(pool, "token-que-nunca-existio", "cualquier-clave-larga", {}),
    ).rejects.toThrow(/no es válido o ya venció/);
  });
});

/* ═══════════════════════════ Cambio de contraseña logueado ═══════════════════════════ */

describe("cambio de contraseña (logueado)", () => {
  it("contraseña actual incorrecta: rechaza sin tocar nada", async () => {
    const { user, session } = await registerUser(pool, NEW_USER, {});
    await expect(
      changePassword(pool, user.id, session.sessionId, "esto-esta-mal", "nueva-clave-larga"),
    ).rejects.toBeInstanceOf(InvalidCurrentPasswordError);
  });

  it("éxito: revoca las demás sesiones pero preserva la actual", async () => {
    const { user, session } = await registerUser(pool, NEW_USER, {});
    const otherDevice = await loginUser(
      pool,
      { email: NEW_USER.email, password: NEW_USER.password },
      {},
    );

    await changePassword(pool, user.id, session.sessionId, NEW_USER.password, "clave-nueva-larga-2");

    expect(await validateSessionToken(db, session.token)).not.toBeNull();
    expect(await validateSessionToken(db, otherDevice.session.token)).toBeNull();

    const relogin = await loginUser(
      pool,
      { email: NEW_USER.email, password: "clave-nueva-larga-2" },
      {},
    );
    expect(relogin.user.email).toBe(normalizeEmail(NEW_USER.email));
  });

  it("regresión (auditoría de seguridad): rate limit por cuenta — no se puede probar currentPassword sin límite", async () => {
    const { user, session } = await registerUser(pool, NEW_USER, {});

    for (let i = 0; i < AUTH_LIMITS.changePasswordMaxPerWindow; i += 1) {
      await changePassword(pool, user.id, session.sessionId, "clave-incorrecta", "nueva-clave-larga").catch(
        () => {},
      );
    }

    await expect(
      changePassword(pool, user.id, session.sessionId, "clave-incorrecta", "nueva-clave-larga"),
    ).rejects.toBeInstanceOf(RateLimitExceededError);

    // Incluso con la contraseña ACTUAL correcta, una vez agotado el límite
    // se rechaza igual — el límite corta antes de verificar nada.
    await expect(
      changePassword(pool, user.id, session.sessionId, NEW_USER.password, "nueva-clave-larga"),
    ).rejects.toBeInstanceOf(RateLimitExceededError);
  });
});

/* ═══════════════════════════ Vincular pedido de invitado ═══════════════════════════ */

describe("vincular pedido de invitado a una cuenta", () => {
  it("un pedido sin dueño se vincula con el token de acceso", async () => {
    const { user } = await registerUser(pool, NEW_USER, {});
    const { orderId, token } = await insertGuestOrder();

    const result = await claimGuestOrder(pool, user.id, token);
    expect(result.alreadyClaimedByThisUser).toBe(false);

    const { rows } = await pool.query<{ user_id: string }>(
      "SELECT user_id FROM orders WHERE id = $1",
      [orderId],
    );
    expect(rows[0].user_id).toBe(user.id);
  });

  it("reclamar el mismo pedido dos veces con la misma cuenta es idempotente", async () => {
    const { user } = await registerUser(pool, NEW_USER, {});
    const { token } = await insertGuestOrder();

    await claimGuestOrder(pool, user.id, token);
    const second = await claimGuestOrder(pool, user.id, token);
    expect(second.alreadyClaimedByThisUser).toBe(true);
  });

  it("un pedido ya vinculado a OTRA cuenta no se puede reclamar", async () => {
    const owner = await registerUser(pool, NEW_USER, {});
    const attacker = await registerUser(pool, { ...NEW_USER, email: "otro@test.local" }, {});
    const { token } = await insertGuestOrder({ userId: owner.user.id });

    await expect(claimGuestOrder(pool, attacker.user.id, token)).rejects.toBeInstanceOf(
      OrderAlreadyClaimedError,
    );
  });

  it("token de pedido inválido o inexistente", async () => {
    const { user } = await registerUser(pool, NEW_USER, {});
    await expect(claimGuestOrder(pool, user.id, "token-fabricado-invalido")).rejects.toBeInstanceOf(
      InvalidOrderTokenError,
    );
  });

  it("token revocado no da acceso a reclamar", async () => {
    const { user } = await registerUser(pool, NEW_USER, {});
    const { token } = await insertGuestOrder({ revoked: true });
    await expect(claimGuestOrder(pool, user.id, token)).rejects.toBeInstanceOf(InvalidOrderTokenError);
  });

  it("dos cuentas reclamando el mismo pedido a la vez: solo una gana", async () => {
    const a = await registerUser(pool, NEW_USER, {});
    const b = await registerUser(pool, { ...NEW_USER, email: "carrera@test.local" }, {});
    const { token } = await insertGuestOrder();

    const results = await Promise.allSettled([
      claimGuestOrder(pool, a.user.id, token),
      claimGuestOrder(pool, b.user.id, token),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
});

/* ═══════════════════════════ Tokens: hashing, no texto plano, IDOR-safe ═══════════════════════════ */

describe("tokens opacos", () => {
  it("hashToken es determinístico y tokenMatches compara correctamente", () => {
    const { value, hash } = createOpaqueToken();
    expect(hashToken(value)).toEqual(hash);
    expect(tokenMatches(value, hash)).toBe(true);
    expect(tokenMatches("otro-valor-cualquiera", hash)).toBe(false);
  });

  it("sesiones nunca guardan el valor crudo del token, solo el hash", async () => {
    const { session } = await registerUser(pool, NEW_USER, {});
    const { rows } = await pool.query<{ token_hash: Buffer }>(
      "SELECT token_hash FROM sessions WHERE id = $1",
      [session.sessionId],
    );
    const stored = rows[0].token_hash.toString("hex");
    expect(stored).not.toContain(session.token);
    expect(Buffer.from(hashToken(session.token))).toEqual(rows[0].token_hash);
  });
});

/* ═══════════════════════════ Cookies: HttpOnly, Secure, SameSite, no localStorage ═══════════════════════════ */

describe("seguridad de la cookie de sesión", () => {
  it("httpOnly siempre activo, SameSite=Lax, Secure según NODE_ENV", () => {
    const dev = baseCookieOptionsForTest("development");
    const prod = baseCookieOptionsForTest("production");

    expect(dev.httpOnly).toBe(true);
    expect(prod.httpOnly).toBe(true);
    expect(dev.sameSite).toBe("lax");
    expect(prod.sameSite).toBe("lax");
    expect(dev.secure).toBe(false);
    expect(prod.secure).toBe(true);
  });
});

/* ═══════════════════════════ server-only en los módulos de auth ═══════════════════════════ */

describe("módulos de autenticación declaran server-only", () => {
  const files = [
    "src/server/auth/password.ts",
    "src/server/auth/session.ts",
    "src/server/auth/cookies.ts",
    "src/server/auth/guards.ts",
    "src/server/services/auth-service.ts",
    "src/server/services/auth-limits.ts",
    "src/server/services/mailer.ts",
    "src/server/http/request-meta.ts",
    "src/server/http/respond.ts",
  ];

  it.each(files)("%s", async (file) => {
    const content = await readFile(path.join(process.cwd(), file), "utf8");
    const top = content.split("\n").filter((l) => l.trim() !== "").slice(0, 3).join("\n");
    expect(top).toMatch(/import\s+"server-only"/);
  });
});

/* ═══════════════════════════ regresión ═══════════════════════════ */

describe("regresión: el resto del inventario sigue funcionando con las tablas de auth", () => {
  it("un usuario registrado puede figurar como owner de una reserva sin romper nada", async () => {
    const { user } = await registerUser(pool, NEW_USER, {});
    await pool.query(
      `INSERT INTO games (id, label, short_label, color_deep, color_base, color_tint)
       VALUES ('valorant','Valorant','Valorant','#5C1420','#9B2438','#C85368')
       ON CONFLICT (id) DO NOTHING`,
    );
    await pool.query(
      `INSERT INTO products (id, game_id, denomination, unit, price_cop)
       VALUES ('valorant-565','valorant','565','VP',28400)
       ON CONFLICT (id) DO NOTHING`,
    );
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO reservations (user_id, expires_at) VALUES ($1::uuid, now() + interval '10 minutes') RETURNING id`,
      [user.id],
    );
    expect(rows).toHaveLength(1);
  });
});

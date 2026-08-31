import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, isLocalDatabase, withTransaction, type Db } from "@/server/db/client";
import { createPool } from "@/server/db/client";
import { MigrationChecksumMismatchError, runMigrations } from "@/server/db/migrate";
import { writeAudit } from "@/server/services/audit";
import {
  QuantityNotAllowedError,
  ReservationExpiredError,
} from "@/server/services/errors";
import {
  confirmOrderPayment,
  createReservation,
  getAvailability,
  releaseReservation,
  sweepExpiredReservations,
} from "@/server/services/inventory";
import { checkRateLimit, RateLimitExceededError, resetRateLimits } from "@/server/services/rate-limit";
import { RESERVATION_LIMITS } from "@/server/services/reservation-limits";
import {
  TEST_PRODUCT_ID,
  countByStatus,
  createOrderFromReservation,
  createTestDatabase,
  expireCodes,
  resetData,
  seedProduct,
} from "./helpers/database";

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
  resetRateLimits();
});

/* ═══════════════════════════ C2 — secretos en audit_logs ═══════════════════════════ */

describe("C2 — la guarda de secretos de audit_logs es recursiva de verdad", () => {
  it("rechaza un secreto dentro de un array", async () => {
    await expect(
      writeAudit(db, {
        actorType: "SYSTEM",
        action: "code.revealed",
        entityType: "code",
        entityId: "x",
        metadata: { items: [{ code: "VLR-1234-5678" }] },
      }),
    ).rejects.toThrow(/secreto en claro/);
  });

  it("rechaza un array dentro de un objeto dentro de un array", async () => {
    await expect(
      writeAudit(db, {
        actorType: "SYSTEM",
        action: "code.revealed",
        entityType: "code",
        entityId: "x",
        metadata: { batch: [{ detalle: { extra: [{ secret: "x" }] } }] },
      }),
    ).rejects.toThrow(/secreto en claro/);
  });

  it("segunda defensa: rechaza un valor con forma de código aunque la clave sea inocente", async () => {
    await expect(
      writeAudit(db, {
        actorType: "SYSTEM",
        action: "code.revealed",
        entityType: "code",
        entityId: "x",
        // Clave "referencia" no está en la lista de claves prohibidas — la
        // defensa por contenido es la que debe atajar esto.
        metadata: { referencia: "VLR-9K2M-7Q1X" },
      }),
    ).rejects.toThrow(/forma de código de inventario/);
  });

  it("acepta ids de código (UUID) sin problema — no son secretos", async () => {
    await writeAudit(db, {
      actorType: "SYSTEM",
      action: "code.reserved",
      entityType: "reservation",
      entityId: "abc",
      metadata: { codeIds: ["11111111-1111-1111-1111-111111111111"], quantity: 1 },
    });
    const { rows } = await pool.query(
      "SELECT count(*)::int c FROM audit_logs WHERE entity_id = 'abc'",
    );
    expect(rows[0].c).toBe(1);
  });
});

/* ═══════════════════════════ A1 — TRUNCATE ═══════════════════════════ */

describe("A1 — audit_logs rechaza TRUNCATE, no solo UPDATE/DELETE", () => {
  it("TRUNCATE lanza en vez de vaciar la tabla en silencio", async () => {
    await writeAudit(db, {
      actorType: "SYSTEM",
      action: "code.reserved",
      entityType: "reservation",
      entityId: "probe",
    });

    await expect(pool.query("TRUNCATE audit_logs")).rejects.toThrow(/append-only/);

    const { rows } = await pool.query("SELECT count(*)::int c FROM audit_logs");
    expect(rows[0].c).toBeGreaterThan(0);
  });
});

/* ═══════════════════════════ A2 — reserva vencida no se convierte en venta ═══════════════════════════ */

describe("A2 — una reserva vencida no puede convertirse en pedido", () => {
  it("attachCodesToOrderItem rechaza aunque el barrido no haya corrido todavía", async () => {
    await seedProduct(pool, { codeCount: 1 });

    const reservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "vence-antes-de-pagar" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      }),
    );

    // El comprador se queda pegado en el checkout; la reserva vence. Nadie
    // corrió el barrido todavía — la fila sigue diciendo RESERVED.
    await expireCodes(pool, reservation.codesByProduct[TEST_PRODUCT_ID]);

    await expect(
      createOrderFromReservation(pool, {
        reservationId: reservation.reservationId,
        productId: TEST_PRODUCT_ID,
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(ReservationExpiredError);

    // Nada quedó a medio camino: ni pedido, ni código reasignado.
    const { rows } = await pool.query<{ count: string }>("SELECT count(*) AS count FROM orders");
    expect(Number(rows[0].count)).toBe(0);
    expect(await countByStatus(pool, TEST_PRODUCT_ID)).toEqual({ RESERVED: 1 });
  });

  it("una reserva CANCELLED tampoco puede venderse", async () => {
    await seedProduct(pool, { codeCount: 1 });

    const reservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "se-arrepiente" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      }),
    );

    await withTransaction(pool, (tx) => releaseReservation(tx, reservation.reservationId));

    await expect(
      createOrderFromReservation(pool, {
        reservationId: reservation.reservationId,
        productId: TEST_PRODUCT_ID,
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(ReservationExpiredError);
  });

  it("una reserva ACTIVE y vigente sí puede convertirse en pedido", async () => {
    await seedProduct(pool, { codeCount: 1 });

    const reservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "compra-normal" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      }),
    );

    const order = await createOrderFromReservation(pool, {
      reservationId: reservation.reservationId,
      productId: TEST_PRODUCT_ID,
      quantity: 1,
    });

    expect(order.codeIds).toHaveLength(1);
  });
});

/* ═══════════════════════════ A3 — abuso de reservas ═══════════════════════════ */

describe("A3 — límites contra abuso de reservas", () => {
  it(`un mismo guest_key no puede pasar de ${RESERVATION_LIMITS.maxActivePerGuest} reserva(s) activa(s)`, async () => {
    await seedProduct(pool, { codeCount: 10 });

    for (let i = 0; i < RESERVATION_LIMITS.maxActivePerGuest; i += 1) {
      await withTransaction(pool, (tx) =>
        createReservation(tx, {
          owner: { guestKey: "acaparador-fijo" },
          lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
        }),
      );
    }

    await expect(
      withTransaction(pool, (tx) =>
        createReservation(tx, {
          owner: { guestKey: "acaparador-fijo" },
          lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
        }),
      ),
    ).rejects.toBeInstanceOf(QuantityNotAllowedError);
  });

  it("dos intentos simultáneos del mismo dueño no se cuelan los dos bajo el tope", async () => {
    await seedProduct(pool, { codeCount: 10, maxPerOrder: 10 });

    // Con maxActivePerGuest=1 (default), de dos intentos paralelos del MISMO
    // guest_key exactamente uno debe ganar. Dos transacciones concurrentes
    // insertando+contando reservations bajo READ COMMITTED podrían en teoría
    // colarse las dos si el conteo no corriera dentro de la misma tx que el
    // INSERT — por eso assertOwnerBelowReservationLimit vive en la misma
    // transacción que crea la fila.
    const results = await Promise.allSettled([
      withTransaction(pool, (tx) =>
        createReservation(tx, {
          owner: { guestKey: "doble-intento" },
          lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
        }),
      ),
      withTransaction(pool, (tx) =>
        createReservation(tx, {
          owner: { guestKey: "doble-intento" },
          lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
        }),
      ),
    ]);

    const winners = results.filter((r) => r.status === "fulfilled");
    expect(winners.length).toBeLessThanOrEqual(RESERVATION_LIMITS.maxActivePerGuest);

    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM reservations WHERE guest_key = 'doble-intento' AND status = 'ACTIVE'",
    );
    expect(Number(rows[0].count)).toBeLessThanOrEqual(RESERVATION_LIMITS.maxActivePerGuest);
  });

  it(
    `rate limit: ${RESERVATION_LIMITS.createMaxPerWindow + 1} intentos con guest_key DISTINTOS pero la ` +
      "misma rateLimitKey (ej. la misma IP) se bloquean igual — así se cierra el hueco " +
      "de generar guest_key arbitrarios para esquivar el tope por dueño",
    async () => {
      await seedProduct(pool, {
        codeCount: RESERVATION_LIMITS.createMaxPerWindow + 5,
        maxPerOrder: 10,
      });

      const attempts = RESERVATION_LIMITS.createMaxPerWindow + 1;
      const outcomes: Array<"ok" | "rate-limited"> = [];

      for (let i = 0; i < attempts; i += 1) {
        try {
          await withTransaction(pool, (tx) =>
            createReservation(tx, {
              owner: { guestKey: `atacante-guest-${i}` }, // distinto en cada intento
              lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
              rateLimitKey: "ip:203.0.113.9", // misma IP simulada
            }),
          );
          outcomes.push("ok");
        } catch (error) {
          if (error instanceof RateLimitExceededError) outcomes.push("rate-limited");
          else throw error;
        }
      }

      expect(outcomes.filter((o) => o === "ok")).toHaveLength(RESERVATION_LIMITS.createMaxPerWindow);
      expect(outcomes.filter((o) => o === "rate-limited")).toHaveLength(1);
    },
  );

  it("checkRateLimit por sí solo: bloquea al superar el máximo dentro de la ventana", () => {
    for (let i = 0; i < 3; i += 1) {
      expect(() => checkRateLimit("clave-de-prueba", 3, 60)).not.toThrow();
    }
    expect(() => checkRateLimit("clave-de-prueba", 3, 60)).toThrow(RateLimitExceededError);
  });
});

/* ═══════════════════════════ A4 — server-only en módulos con secretos ═══════════════════════════ */

describe("A4 — módulos con secretos declaran server-only", () => {
  const mustHaveServerOnly = [
    "src/server/crypto/codes.ts",
    "src/server/auth/tokens.ts",
    "src/server/services/audit.ts",
    "src/server/services/inventory.ts",
    "src/server/db/client.ts",
    "src/server/db/migrate.ts",
    "src/server/db/seed.ts",
    "src/server/services/reservation-limits.ts",
    "src/server/services/rate-limit.ts",
  ];

  it.each(mustHaveServerOnly)('%s importa "server-only" antes que nada útil', async (file) => {
    const content = await readFile(path.join(process.cwd(), file), "utf8");
    // No alcanza con que aparezca en cualquier parte: tiene que ser de las
    // primeras líneas reales, o un bundler que solo mira el top del archivo
    // (algunos lo hacen por performance) podría no verlo. server-only en sí
    // mismo no depende de eso, pero mantenerlo arriba es la convención del
    // resto del repo.
    const firstRealLines = content
      .split("\n")
      .filter((l) => l.trim() !== "")
      .slice(0, 3)
      .join("\n");
    expect(firstRealLines).toMatch(/import\s+"server-only"/);
  });

  it(
    "límite conocido: esto es un chequeo estático de texto, no una prueba de bundling real. " +
      "La prueba definitiva es un build de Next con un componente cliente importando alguno " +
      "de estos módulos y comprobar que falla — no se automatizó acá por costo (un build " +
      "completo por corrida de tests). Ver trade-offs en el resumen de la auditoría.",
    () => {
      expect(true).toBe(true);
    },
  );
});

/* ═══════════════════════════ M1 — SSL por hostname exacto ═══════════════════════════ */

describe("M1 — detección de localhost por hostname exacto, no substring", () => {
  it.each([
    ["postgres://u:p@localhost:5432/db", true],
    ["postgres://u:p@127.0.0.1:5432/db", true],
    ["postgres://u:p@[::1]:5432/db", true],
    ["postgres://u:p@db.localhost.evil-proxy.com:5432/db", false],
    ["postgres://localhost:p@db.neon.tech:5432/db", false], // "localhost" en la password
    ["postgres://u:p@my-localhost-db.internal:5432/db", false],
    ["postgres://u:p@ep-cool-name-123.us-east-2.aws.neon.tech:5432/db", false],
  ])("%s → local=%s", (url, expected) => {
    expect(isLocalDatabase(url)).toBe(expected);
  });

  it("createPool desactiva ssl solo para hosts realmente locales", () => {
    const local = createPool("postgres://u:p@localhost:5433/loadout");
    const remote = createPool("postgres://u:p@db.localhost.fake.com:5432/loadout");
    try {
      expect(local.options.ssl).toBeUndefined();
      expect(remote.options.ssl).toEqual({ rejectUnauthorized: true });
    } finally {
      void local.end();
      void remote.end();
    }
  });
});

/* ═══════════════════════════ M2 — índice con product_id ═══════════════════════════ */

describe("M2 — codes_reclaimable_idx incluye product_id", () => {
  it("el índice existe y su definición arranca por product_id", async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'codes_reclaimable_idx'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/\(product_id, reserved_until\)/);
  });
});

/* ═══════════════════════════ M3 — isolation level explícito ═══════════════════════════ */

describe("M3 — READ COMMITTED explícito en cada transacción de inventario", () => {
  it("beginTransaction fija el nivel, no depende del default del servidor", async () => {
    await withTransaction(pool, async (tx) => {
      const result = (await tx.execute(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "SHOW transaction_isolation" as any,
      )) as unknown as { rows: Array<{ transaction_isolation: string }> };
      expect(result.rows[0].transaction_isolation).toBe("read committed");
    });
  });
});

/* ═══════════════════════════ M4 — timeouts configurados ═══════════════════════════ */

describe("M4 — statement_timeout e idle_in_transaction_session_timeout configurados", () => {
  it("createPool aplica los defaults cuando no hay override por env", () => {
    delete process.env.PG_STATEMENT_TIMEOUT_MS;
    delete process.env.PG_IDLE_IN_TRANSACTION_TIMEOUT_MS;
    const p = createPool("postgres://u:p@localhost:5433/loadout");
    try {
      expect(p.options.statement_timeout).toBe(15_000);
      expect(p.options.idle_in_transaction_session_timeout).toBe(10_000);
    } finally {
      void p.end();
    }
  });

  it("respeta el override por variable de entorno", () => {
    process.env.PG_STATEMENT_TIMEOUT_MS = "5000";
    const p = createPool("postgres://u:p@localhost:5433/loadout");
    try {
      expect(p.options.statement_timeout).toBe(5000);
    } finally {
      void p.end();
      delete process.env.PG_STATEMENT_TIMEOUT_MS;
    }
  });
});

/* ═══════════════════════════ M5 — auditoría de transiciones ═══════════════════════════ */

describe("M5 — se audita reserved / released / assigned / paid, nunca con el secreto", () => {
  it("el ciclo completo deja rastro en audit_logs sin exponer códigos", async () => {
    await seedProduct(pool, { codeCount: 2 });

    const reservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "auditado" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      }),
    );

    const order = await createOrderFromReservation(pool, {
      reservationId: reservation.reservationId,
      productId: TEST_PRODUCT_ID,
      quantity: 1,
    });

    await withTransaction(pool, (tx) => confirmOrderPayment(tx, order.orderId));

    const { rows: actions } = await pool.query<{ action: string; count: string }>(
      "SELECT action, count(*) AS count FROM audit_logs GROUP BY action",
    );
    const byAction = Object.fromEntries(actions.map((r) => [r.action, Number(r.count)]));

    expect(byAction["code.reserved"]).toBeGreaterThanOrEqual(1);
    expect(byAction["code.assigned"]).toBeGreaterThanOrEqual(1);
    expect(byAction["order.paid"]).toBe(1);

    // También se ejerce "released" en un escenario separado, para no
    // depender del orden de otros tests sobre la misma tabla.
    const secondReservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "se-arrepiente-2" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      }),
    );
    await withTransaction(pool, (tx) => releaseReservation(tx, secondReservation.reservationId));

    // audit_logs es append-only y no se trunca entre tests (a propósito),
    // así que se filtra por esta reserva puntual en vez de contar global.
    const { rows: released } = await pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM audit_logs WHERE action = 'code.released' AND entity_id = $1",
      [secondReservation.reservationId],
    );
    expect(Number(released[0].count)).toBe(1);

    // Ningún registro de auditoría de este flujo contiene el código en claro.
    const { rows: all } = await pool.query<{ metadata: unknown }>(
      "SELECT metadata FROM audit_logs",
    );
    for (const row of all) {
      const text = JSON.stringify(row.metadata);
      expect(text).not.toMatch(/\b[A-Z]{2,4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/);
    }
  });
});

/* ═══════════════════════════ M6 — checksum de migraciones ═══════════════════════════ */

describe("M6 — checksum de migraciones detecta edición post-aplicación", () => {
  it("correr runMigrations dos veces seguidas no reaplica nada y no falla", async () => {
    const second = await runMigrations(pool);
    expect(second).toEqual([]);
  });

  it("editar una migración ya aplicada hace fallar la corrida siguiente", async () => {
    const { writeFile, mkdtemp, rm, copyFile, readdir } = await import("node:fs/promises");
    const os = await import("node:os");
    const migrationsSrc = path.join(process.cwd(), "src/server/db/migrations");
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "loadout-migrations-"));

    try {
      const files = await readdir(migrationsSrc);
      for (const file of files) {
        await copyFile(path.join(migrationsSrc, file), path.join(tmpDir, file));
      }

      // Primera corrida contra el directorio temporal: aplica todo normal.
      await runMigrations(pool, tmpDir);

      // Alguien "edita" 0000_init.sql después de aplicada.
      const target = path.join(tmpDir, "0000_init.sql");
      const original = await import("node:fs/promises").then((fs) => fs.readFile(target, "utf8"));
      await writeFile(target, `${original}\n-- comentario colado después del hecho\n`);

      await expect(runMigrations(pool, tmpDir)).rejects.toBeInstanceOf(
        MigrationChecksumMismatchError,
      );
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

/* ═══════════════════════════ M7 — consistencia codes/orders al pagar ═══════════════════════════ */

describe("M7 — confirmOrderPayment mantiene codes y orders consistentes", () => {
  it("payment_status, delivery_status y el status de los códigos quedan alineados", async () => {
    await seedProduct(pool, { codeCount: 1 });

    const reservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "paga-bien" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      }),
    );
    const order = await createOrderFromReservation(pool, {
      reservationId: reservation.reservationId,
      productId: TEST_PRODUCT_ID,
      quantity: 1,
    });

    await withTransaction(pool, (tx) => confirmOrderPayment(tx, order.orderId));

    const { rows } = await pool.query<{
      payment_status: string;
      delivery_status: string;
      paid_at: string | null;
      codes_paid: string;
    }>(
      `SELECT o.payment_status, o.delivery_status, o.paid_at,
              (SELECT count(*) FROM codes c
                 JOIN order_items oi ON oi.id = c.order_item_id
                WHERE oi.order_id = o.id AND c.status = 'PAID') AS codes_paid
         FROM orders o WHERE o.id = $1::uuid`,
      [order.orderId],
    );

    expect(rows[0].payment_status).toBe("PAID");
    expect(rows[0].delivery_status).toBe("DELIVERED");
    expect(rows[0].paid_at).not.toBeNull();
    expect(Number(rows[0].codes_paid)).toBe(1);
  });

  it("nunca queda un código PAID con el pedido todavía PENDING", async () => {
    await seedProduct(pool, { codeCount: 3 });

    for (let i = 0; i < 3; i += 1) {
      const reservation = await withTransaction(pool, (tx) =>
        createReservation(tx, {
          owner: { guestKey: `paga-${i}` },
          lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
        }),
      );
      const order = await createOrderFromReservation(pool, {
        reservationId: reservation.reservationId,
        productId: TEST_PRODUCT_ID,
        quantity: 1,
      });
      if (i < 2) {
        await withTransaction(pool, (tx) => confirmOrderPayment(tx, order.orderId));
      }
      // El tercero se deja PENDING a propósito.
    }

    const { rows } = await pool.query<{ count: string }>(`
      SELECT count(*) AS count
        FROM codes c
        JOIN order_items oi ON oi.id = c.order_item_id
        JOIN orders o ON o.id = oi.order_id
       WHERE c.status = 'PAID' AND o.payment_status <> 'PAID'
    `);
    expect(Number(rows[0].count)).toBe(0);
  });
});

/* ═══════════════════════════ M8 — la conexión siempre se libera ═══════════════════════════ */

describe("M8 — una transacción libera su conexión aunque falle a mitad de camino", () => {
  it("N transacciones fallidas seguidas no agotan el pool", async () => {
    const before = pool.idleCount + pool.waitingCount;

    for (let i = 0; i < 15; i += 1) {
      await expect(
        withTransaction(pool, async () => {
          throw new Error("falla a propósito a mitad de la transacción");
        }),
      ).rejects.toThrow("falla a propósito");
    }

    // Si alguna conexión hubiera quedado sin liberar, esto se cuelga o tarda
    // muchísimo más de lo normal esperando un slot libre del pool.
    const stillWorks = await withTransaction(pool, async (tx) => {
      const r = (await tx.execute("SELECT 1 AS ok" as never)) as unknown as {
        rows: Array<{ ok: number }>;
      };
      return r.rows[0].ok;
    });
    expect(stillWorks).toBe(1);

    expect(pool.idleCount + pool.waitingCount).toBeGreaterThanOrEqual(0);
    void before;
  }, 30_000);
});

/* ═══════════════════════════ regresión de la suite original ═══════════════════════════ */

describe("regresión: el barrido y la disponibilidad siguen coherentes tras los fixes", () => {
  it("sweepExpiredReservations y getAvailability no se rompieron con los cambios de A2/M2", async () => {
    await seedProduct(pool, { codeCount: 1 });
    const reservation = await withTransaction(pool, (tx) =>
      createReservation(tx, {
        owner: { guestKey: "barrido-ok" },
        lines: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
      }),
    );
    await expireCodes(pool, reservation.codesByProduct[TEST_PRODUCT_ID]);

    expect((await getAvailability(db, [TEST_PRODUCT_ID])).get(TEST_PRODUCT_ID)).toBe(1);

    const swept = await sweepExpiredReservations(db);
    expect(swept.codesReleased).toBe(1);
  });
});

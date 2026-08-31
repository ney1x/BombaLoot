import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);

// En Windows, npm/npx son .cmd: execFile sin shell tira "spawn npx ENOENT",
// y apuntar directo a npx.cmd tira "spawn EINVAL" (un .cmd no es un
// ejecutable nativo, necesita que cmd.exe lo interprete). shell:true es la
// forma soportada de spawnear un .cmd en Windows. El warning de Node sobre
// args-sin-escapar con shell:true no aplica acá: todos los argumentos son
// literales fijos del propio archivo (rutas de este repo), nunca entrada
// externa ni interpolación de datos de usuario.
const TSC_EXEC_OPTS = { shell: true } as const;

/**
 * Prueba de C1 a nivel de tipos.
 *
 * El resto de la suite prueba comportamiento en tiempo de ejecución; C1 es
 * al revés — la protección es que el código malo **no llega a ejecutarse
 * nunca** porque no compila. Eso solo se prueba invocando `tsc` de verdad
 * sobre un fixture, no con un `expect(...).toThrow()`.
 *
 * `pool-rejected/fixture.ts` intenta pasar `getDb()` (el pool en autocommit)
 * donde se pide `TxDb`, protegido con `@ts-expect-error`. Si la marca nominal
 * de `TxDb` sigue vigente, ese `@ts-expect-error` tiene un error real que
 * suprimir → el archivo compila limpio (exit 0). Si alguien quita el brand
 * (o cambia `TxDb` por un alias que no exige nada), el error desaparece,
 * `@ts-expect-error` queda "usado de más" y **tsc falla** → el test detecta
 * la regresión.
 */
describe("C1 — TxDb como tipo nominal", () => {
  it("pasar el pool (Db) donde se pide TxDb es un error real, capturado por @ts-expect-error", async () => {
    await expect(
      exec("npx", ["tsc", "--noEmit", "-p", "tests/types/pool-rejected/tsconfig.json"], TSC_EXEC_OPTS),
    ).resolves.toBeDefined();
  }, 60_000);

  it("el uso correcto dentro de una transacción compila sin trucos", async () => {
    await expect(
      exec("npx", ["tsc", "--noEmit", "-p", "tests/types/tx-accepted/tsconfig.json"], TSC_EXEC_OPTS),
    ).resolves.toBeDefined();
  }, 60_000);

  it("REGRESIÓN: sin @ts-expect-error, tsc rechaza el pool por el símbolo de marca", async () => {
    // No toca el fixture real: reproduce la línea mala tal cual, sin la
    // supresión, para demostrar que el rechazo es genuino y no un artefacto
    // de cómo está armado el fixture.
    const { writeFile, unlink, mkdir } = await import("node:fs/promises");
    const dir = "tests/types/__regression__";
    await mkdir(dir, { recursive: true });
    await writeFile(
      `${dir}/fixture.ts`,
      [
        'import { getDb } from "@/server/db/client";',
        'import { createReservation } from "@/server/services/inventory";',
        "createReservation(getDb(), { owner: { guestKey: 'x' }, lines: [] });",
      ].join("\n"),
    );
    await writeFile(
      `${dir}/tsconfig.json`,
      JSON.stringify(
        { extends: "../../../tsconfig.json", compilerOptions: { noEmit: true }, include: ["fixture.ts"] },
        null,
        2,
      ),
    );

    try {
      await expect(
        exec("npx", ["tsc", "--noEmit", "-p", `${dir}/tsconfig.json`], TSC_EXEC_OPTS),
      ).rejects.toMatchObject({
        stdout: expect.stringContaining("TRANSACTION_BRAND"),
      });
    } finally {
      await unlink(`${dir}/fixture.ts`);
      await unlink(`${dir}/tsconfig.json`);
    }
  }, 60_000);
});

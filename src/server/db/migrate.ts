import "server-only";

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

export const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

function checksumOf(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Se lanza cuando el contenido de un archivo de migración YA APLICADO no
 * coincide con el checksum guardado la primera vez (hallazgo M6).
 *
 * Antes de esto, el runner solo miraba si el *nombre* del archivo estaba en
 * `_migrations` — editar `0000_init.sql` después de aplicada (a mano, con un
 * merge, lo que sea) pasaba completamente desapercibido: la base ya tenía el
 * contenido viejo, y nadie se enteraba de que el archivo en el repo decía
 * otra cosa. Ahora el checksum se guarda al aplicar y se revalida en cada
 * corrida del runner, aunque la migración no se vuelva a ejecutar.
 */
export class MigrationChecksumMismatchError extends Error {
  constructor(
    readonly file: string,
    readonly storedChecksum: string,
    readonly currentChecksum: string,
  ) {
    super(
      `La migración ${file} ya está aplicada pero su contenido cambió ` +
        `(checksum guardado ${storedChecksum.slice(0, 12)}… vs actual ${currentChecksum.slice(0, 12)}…). ` +
        `Una migración aplicada no se edita: crear una migración nueva.`,
    );
    this.name = "MigrationChecksumMismatchError";
  }
}

/**
 * Runner de migraciones.
 *
 * Cada archivo `.sql` se aplica una sola vez, en orden alfabético, dentro de
 * una transacción que incluye su propio registro en `_migrations`: o queda
 * aplicada y anotada, o no pasó ninguna de las dos cosas. El checksum de cada
 * archivo se revalida en cada corrida, se haya aplicado o no en esta llamada.
 */
export async function runMigrations(
  pool: Pool,
  dir: string = MIGRATIONS_DIR,
): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       text PRIMARY KEY,
      checksum   text,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  // Compatibilidad con bases que ya tenían _migrations sin la columna
  // (creadas antes de M6).
  await pool.query(`ALTER TABLE _migrations ADD COLUMN IF NOT EXISTS checksum text`);

  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];

  for (const file of files) {
    const content = await readFile(path.join(dir, file), "utf8");
    const checksum = checksumOf(content);

    const { rows } = await pool.query<{ checksum: string | null }>(
      "SELECT checksum FROM _migrations WHERE name = $1",
      [file],
    );

    if (rows.length > 0) {
      const stored = rows[0].checksum;
      // Migraciones aplicadas antes de M6 no tienen checksum guardado
      // todavía: se backfillea en silencio en vez de fallar por algo que
      // nunca se pudo comparar.
      if (stored === null) {
        await pool.query("UPDATE _migrations SET checksum = $2 WHERE name = $1", [
          file,
          checksum,
        ]);
      } else if (stored !== checksum) {
        throw new MigrationChecksumMismatchError(file, stored, checksum);
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(content);
      await client.query(
        "INSERT INTO _migrations (name, checksum) VALUES ($1, $2)",
        [file, checksum],
      );
      await client.query("COMMIT");
      applied.push(file);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preferir el error original de la migración al de un ROLLBACK sobre
        // una conexión que ya quedó en estado abortado (hallazgo M8).
      }
      throw new Error(`Falló la migración ${file}: ${(error as Error).message}`, {
        cause: error,
      });
    } finally {
      // finally corre siempre, incluso si el catch de arriba relanza: la
      // conexión nunca queda sin liberar (hallazgo M8).
      client.release();
    }
  }

  return applied;
}

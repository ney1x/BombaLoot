import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { createDb, type Db } from "../db/client";
import type { ValidatedSession } from "../auth/session";
import { writeAudit } from "./audit";

/**
 * Preferencias editables de vigencia de códigos y equidad entre admins — fila
 * única en `code_lifecycle_settings` (0023). `inventory.ts` las lee en vivo
 * con una subquery en cada reclamo/conteo de stock, así que un cambio acá
 * aplica de inmediato, sin caché que invalidar.
 */

export interface CodeLifecycleSettings {
  expiryDays: number;
  riskWindowDays: number;
  fairnessGapDays: number;
  updatedAt: Date;
  updatedByName: string | null;
}

interface SettingsRow {
  expiry_days: number;
  risk_window_days: number;
  fairness_gap_days: number;
  updated_at: string;
  updated_by_name: string | null;
  updated_by_email: string | null;
}

function toSettings(row: SettingsRow): CodeLifecycleSettings {
  return {
    expiryDays: row.expiry_days,
    riskWindowDays: row.risk_window_days,
    fairnessGapDays: row.fairness_gap_days,
    updatedAt: new Date(row.updated_at),
    updatedByName: row.updated_by_name ?? row.updated_by_email,
  };
}

export async function getCodeLifecycleSettings(db: Db): Promise<CodeLifecycleSettings> {
  const { rows } = (await db.execute(sql`
    SELECT s.expiry_days, s.risk_window_days, s.fairness_gap_days, s.updated_at,
           u.name AS updated_by_name, u.email AS updated_by_email
      FROM code_lifecycle_settings s
      LEFT JOIN users u ON u.id = s.updated_by
     WHERE s.id = true
  `)) as unknown as { rows: SettingsRow[] };
  return toSettings(rows[0]);
}

export const updateCodeLifecycleSettingsSchema = z
  .object({
    expiryDays: z.number().int().positive(),
    riskWindowDays: z.number().int().positive(),
    fairnessGapDays: z.number().int().positive(),
  })
  .refine((v) => v.expiryDays > v.riskWindowDays, {
    message: "expiryDays debe ser mayor que riskWindowDays",
    path: ["expiryDays"],
  });

export async function updateCodeLifecycleSettings(
  pool: Pool,
  actor: ValidatedSession,
  input: z.infer<typeof updateCodeLifecycleSettingsSchema>,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<CodeLifecycleSettings> {
  const db = createDb(pool);

  await db.execute(sql`
    UPDATE code_lifecycle_settings
       SET expiry_days = ${input.expiryDays},
           risk_window_days = ${input.riskWindowDays},
           fairness_gap_days = ${input.fairnessGapDays},
           updated_by = ${actor.userId}::uuid,
           updated_at = now()
     WHERE id = true
  `);

  await writeAudit(db, {
    actorType: actor.role,
    actorId: actor.userId,
    action: "code_lifecycle_settings.updated",
    entityType: "code_lifecycle_settings",
    entityId: "singleton",
    metadata: { ...input },
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return getCodeLifecycleSettings(db);
}

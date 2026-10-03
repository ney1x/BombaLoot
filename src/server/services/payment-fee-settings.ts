import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { createDb, type Db } from "../db/client";
import type { ValidatedSession } from "../auth/session";
import { writeAudit } from "./audit";

/**
 * Tarifa de Wompi para poder ESTIMAR su comisión — Wompi no la expone por
 * API (a diferencia de PayPal, que sí manda la comisión exacta en cada
 * captura). Fila única en `payment_fee_settings` (0026), mismo patrón que
 * `code_lifecycle_settings`. Los valores default son el Plan Avanzado que
 * Wompi publica (2.65% + $700 COP + IVA del 19% sobre la comisión) —
 * editable acá si el plan real pactado es otro.
 *
 * Puntos básicos (1/100 de 1%) en vez de decimales: 265 = 2.65%, evita
 * arrastrar floats en un cálculo de plata.
 */

export interface PaymentFeeSettings {
  wompiPercentageBp: number;
  wompiFixedCop: number;
  wompiIvaBp: number;
  updatedAt: Date;
  updatedByName: string | null;
}

interface SettingsRow {
  wompi_percentage_bp: number;
  wompi_fixed_cop: number;
  wompi_iva_bp: number;
  updated_at: string;
  updated_by_name: string | null;
  updated_by_email: string | null;
}

function toSettings(row: SettingsRow): PaymentFeeSettings {
  return {
    wompiPercentageBp: row.wompi_percentage_bp,
    wompiFixedCop: row.wompi_fixed_cop,
    wompiIvaBp: row.wompi_iva_bp,
    updatedAt: new Date(row.updated_at),
    updatedByName: row.updated_by_name ?? row.updated_by_email,
  };
}

export async function getPaymentFeeSettings(db: Db): Promise<PaymentFeeSettings> {
  const { rows } = (await db.execute(sql`
    SELECT s.wompi_percentage_bp, s.wompi_fixed_cop, s.wompi_iva_bp, s.updated_at,
           u.name AS updated_by_name, u.email AS updated_by_email
      FROM payment_fee_settings s
      LEFT JOIN users u ON u.id = s.updated_by
     WHERE s.id = true
  `)) as unknown as { rows: SettingsRow[] };
  return toSettings(rows[0]);
}

export const updatePaymentFeeSettingsSchema = z.object({
  wompiPercentageBp: z.number().int().min(0).max(10_000),
  wompiFixedCop: z.number().int().min(0),
  wompiIvaBp: z.number().int().min(0).max(10_000),
});

export async function updatePaymentFeeSettings(
  pool: Pool,
  actor: ValidatedSession,
  input: z.infer<typeof updatePaymentFeeSettingsSchema>,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<PaymentFeeSettings> {
  const db = createDb(pool);

  await db.execute(sql`
    UPDATE payment_fee_settings
       SET wompi_percentage_bp = ${input.wompiPercentageBp},
           wompi_fixed_cop = ${input.wompiFixedCop},
           wompi_iva_bp = ${input.wompiIvaBp},
           updated_by = ${actor.userId}::uuid,
           updated_at = now()
     WHERE id = true
  `);

  await writeAudit(db, {
    actorType: actor.role,
    actorId: actor.userId,
    action: "payment_fee_settings.updated",
    entityType: "payment_fee_settings",
    entityId: "singleton",
    metadata: { ...input },
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return getPaymentFeeSettings(db);
}

/**
 * Comisión ESTIMADA de Wompi sobre un monto en COP, con la tarifa vigente
 * al momento del cálculo — se llama justo cuando el pago se aprueba, para
 * que quede grabada como una foto de ese momento (`payment_intents.fee_cop`)
 * y no cambie retroactivamente si alguien edita la tarifa después.
 */
export function estimateWompiFeeCop(amountCop: number, settings: PaymentFeeSettings): number {
  const commission = Math.round((amountCop * settings.wompiPercentageBp) / 10_000) + settings.wompiFixedCop;
  const iva = Math.round((commission * settings.wompiIvaBp) / 10_000);
  return commission + iva;
}

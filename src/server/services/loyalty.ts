import "server-only";

import { sql } from "drizzle-orm";
import type { Db } from "../db/client";

/**
 * Nivel de fidelización resuelto desde `loyalty_tiers` — nunca desde el
 * cliente. Los niveles y sus porcentajes siguen siendo datos configurables
 * (la tabla, no una constante en código), tal como se aprobó en la fase de
 * arquitectura.
 */
export interface ResolvedTier {
  id: string;
  name: string;
  discountPct: number;
}

/**
 * El nivel más alto cuyo `min_purchases` no supera las compras del
 * comprador. Un invitado (sin `purchasesCount`) no tiene nivel — el
 * checkout ya lo maneja pasando `null` para invitados, nunca llamando a
 * esto con un número inventado.
 */
export async function resolveLoyaltyTier(db: Db, purchasesCount: number): Promise<ResolvedTier | null> {
  const { rows } = (await db.execute(sql`
    SELECT id, name, discount_pct
      FROM loyalty_tiers
     WHERE is_active
       AND min_purchases <= ${purchasesCount}
     ORDER BY min_purchases DESC
     LIMIT 1
  `)) as unknown as { rows: Array<{ id: string; name: string; discount_pct: string }> };

  const row = rows[0];
  if (!row) return null;

  return { id: row.id, name: row.name, discountPct: Number(row.discount_pct) };
}

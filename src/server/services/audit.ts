import "server-only";

import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { sanitizeIpForStorage } from "../http/request-meta";

export type ActorType = "CUSTOMER" | "ADMIN" | "SUPPORT" | "SUPERADMIN" | "SYSTEM";

export type AuditAction =
  | "code.uploaded"
  | "code.reserved"
  | "code.released"
  | "code.assigned"
  | "code.revealed"
  | "code.voided"
  | "order.created"
  | "order.paid"
  | "order.paid_unavailable"
  | "order.failed"
  | "order.refunded"
  | "code.delivered"
  | "code.delivered_by_support"
  | "code.resent_by_support"
  | "payment.intent_created"
  | "payment.webhook_received"
  | "payment.webhook_duplicate"
  | "payment.webhook_rejected"
  | "payment.webhook_out_of_order"
  | "payment.webhook_orphan"
  | "payment.manual_sync"
  | "refund.requested"
  | "refund.initiated"
  | "refund.completed"
  | "refund.failed"
  | "refund.manual_review"
  | "refund.cancelled"
  | "auth.registered"
  | "auth.google_registered"
  | "auth.login"
  | "auth.google_login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_changed"
  | "auth.password_reset_requested"
  | "auth.password_reset"
  | "auth.session_revoked_all"
  | "auth.role_changed"
  | "auth.order_claimed"
  | "admin.price_changed"
  | "admin.discount_changed"
  | "admin.order_adjusted"
  | "order.email_changed"
  | "admin.role_changed"
  | "support.role_assigned"
  | "support.role_removed"
  | "admin.invite_sent"
  | "admin.invite_resent"
  | "admin.invite_accepted"
  | "admin.invite_revoked"
  | "admin.role_removed"
  | "admin.role_restored"
  | "code_lifecycle_settings.updated"
  | "product.created"
  | "product.updated"
  | "product.toggled_active"
  | "product.hero_order_set"
  | "code.edited"
  | "code.deleted"
  | "refund.manual_completed"
  | "code.unvoided"
  | "product_image.added"
  | "product_image.updated"
  | "product_image.deleted"
  | "game_visual.added"
  | "game_visual.updated"
  | "game_visual.deleted"
  | "loyalty_tier.created"
  | "loyalty_tier.updated"
  | "loyalty_tier.toggled_active"
  | "discount.created"
  | "discount.updated"
  | "discount.toggled_active"
  | "auth.login_blocked_suspended"
  | "account.suspended"
  | "account.unsuspended"
  | "account.deleted"
  | "security.ip_blocked"
  | "security.ip_unblocked"
  | "security.blocked_ip_attempt"
  | "order.cancelled_fraud";

export interface AuditEntry {
  actorType: ActorType;
  actorId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Guarda de secretos en `audit_logs` (hallazgo C2 de la auditoría).
 *
 * Dos defensas independientes, no una sola:
 *
 * 1. **Por clave, recursiva de verdad.** La versión anterior bajaba a objetos
 *    anidados pero cortaba en el primer array (`Array.isArray(value)` volvía
 *    `false` y se saltaba la rama entera) — `{ items: [{ code: "..." }] }`
 *    pasaba limpio. Ahora recorre objetos y arrays indistintamente, en
 *    cualquier combinación de anidamiento.
 *
 * 2. **Por contenido, sobre el JSON serializado completo.** La defensa (1)
 *    depende de que el secreto esté bajo una clave con nombre sospechoso.  Si
 *    alguien lo guarda bajo `{ referencia: "VLR-9K2M-7Q1X" }` — clave
 *    inocente, valor real — la (1) no lo ve. La (2) busca en el texto
 *    completo del JSON el patrón de un código generado por
 *    `generateMockCode`/`generatePlainCode` (prefijo de 2-4 letras, dos
 *    bloques alfanuméricos de 4), sin importar bajo qué clave esté.
 *
 * Cualquiera de las dos que dispare, la escritura entera se rechaza — no se
 * intenta "limpiar" el objeto y guardar el resto, porque eso es exactamente
 * el tipo de lógica que falla en silencio con la siguiente forma de dato que
 * nadie previó.
 */
const FORBIDDEN_KEYS = /^(code|codigo|código|secret|secreto|plain|plaintext|password|token)$/i;

/** Coincide con el formato PREFIJO-XXXX-XXXX de los códigos generados. */
const CODE_LIKE_VALUE = /\b[A-Z]{2,4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/;

function assertNoSecretKeys(metadata: unknown, path = "metadata"): void {
  if (Array.isArray(metadata)) {
    metadata.forEach((item, index) => assertNoSecretKeys(item, `${path}[${index}]`));
    return;
  }

  if (metadata === null || typeof metadata !== "object") return;

  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.test(key)) {
      throw new Error(
        `audit: ${path}.${key} podría contener un secreto en claro. Guardar el id, nunca el valor.`,
      );
    }
    assertNoSecretKeys(value, `${path}.${key}`);
  }
}

function assertNoSecretShapedContent(metadata: Record<string, unknown>): void {
  const serialized = JSON.stringify(metadata);
  const match = serialized.match(CODE_LIKE_VALUE);
  if (match) {
    throw new Error(
      `audit: metadata contiene un valor con forma de código de inventario ("${match[0]}"). ` +
        `Guardar el id del código, nunca el código en sí.`,
    );
  }
}

function assertNoSecrets(metadata: Record<string, unknown>): void {
  assertNoSecretKeys(metadata);
  assertNoSecretShapedContent(metadata);
}

export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  const metadata = entry.metadata ?? {};
  assertNoSecrets(metadata);

  await db.execute(sql`
    INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, metadata, ip, user_agent)
    VALUES (
      ${entry.actorType},
      ${entry.actorId ?? null}::uuid,
      ${entry.action},
      ${entry.entityType},
      ${entry.entityId},
      ${JSON.stringify(metadata)}::jsonb,
      ${sanitizeIpForStorage(entry.ip)}::inet,
      ${entry.userAgent ?? null}
    )
  `);
}

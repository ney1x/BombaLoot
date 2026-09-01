import "server-only";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { createDb, withTransaction, type Db } from "../db/client";
import { InvalidTicketTokenError } from "../auth/errors";
import { createOpaqueToken, generateTicketNumber, hashToken } from "../auth/tokens";
import { SUPPORT_CATEGORIES } from "@/lib/support";
import { SUPPORT_LIMITS } from "./support-limits";
import { SupportTicketNotFoundError } from "./errors";
import { checkRateLimit } from "./rate-limit";

/**
 * Tickets de soporte e hilo de mensajes cliente↔admin/SUPPORT.
 *
 * Mismo criterio de acceso que `checkout-service.ts` para pedidos de
 * invitado: poseer el token opaco (`access_token_hash`) es la prueba de
 * propiedad para quien no está logueado; quien sí lo está puede además
 * acceder por ser dueño (`user_id`), igual que `getOrderForUser`.
 */

const CATEGORY_VALUES = SUPPORT_CATEGORIES.map((c) => c.value) as [string, ...string[]];

export const createTicketSchema = z.object({
  email: z.string().trim().email("Ingresá un email válido").max(255),
  category: z.enum(CATEGORY_VALUES),
  message: z
    .string()
    .trim()
    .min(10, "Contanos un poco más (mínimo 10 caracteres)")
    .max(4000),
  orderNumberInput: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const supportMessageSchema = z.object({
  body: z.string().trim().min(1, "Escribí un mensaje").max(4000),
});

export const supportTicketUpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});

export interface SupportMessageView {
  id: string;
  ticketId: string;
  senderType: "CUSTOMER" | "ADMIN";
  senderUserId: string | null;
  body: string;
  createdAt: Date;
}

export interface SupportTicketView {
  id: string;
  ticketNumber: string;
  email: string;
  userId: string | null;
  category: string;
  status: string;
  orderId: string | null;
  orderNumber: string | null;
  orderNumberInput: string | null;
  assignedTo: string | null;
  assignedToEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
}

interface TicketRow {
  id: string;
  ticket_number: string;
  email: string;
  user_id: string | null;
  category: string;
  status: string;
  order_id: string | null;
  order_number: string | null;
  order_number_input: string | null;
  assigned_to: string | null;
  assigned_to_email: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
}

function toTicketView(row: TicketRow): SupportTicketView {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    email: row.email,
    userId: row.user_id,
    category: row.category,
    status: row.status,
    orderId: row.order_id,
    orderNumber: row.order_number,
    orderNumberInput: row.order_number_input,
    assignedTo: row.assigned_to,
    assignedToEmail: row.assigned_to_email,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastMessageAt: new Date(row.last_message_at),
  };
}

const TICKET_SELECT = sql`
    SELECT t.id, t.ticket_number, t.email, t.user_id, t.category, t.status,
           t.order_id, o.order_number, t.order_number_input,
           t.assigned_to, au.email AS assigned_to_email,
           t.created_at, t.updated_at, t.last_message_at
      FROM support_tickets t
      LEFT JOIN orders o ON o.id = t.order_id
      LEFT JOIN users au ON au.id = t.assigned_to
`;

/**
 * Crea el ticket y su primer mensaje en una sola transacción. `order_id` se
 * resuelve por número exacto (case-insensitive) si el cliente escribió uno
 * — no es una búsqueda de autorización, el número de pedido no es
 * credencial (ver `tokens.ts`), solo le ahorra a soporte tener que
 * buscarlo a mano.
 */
export async function createSupportTicket(
  pool: Pool,
  input: CreateTicketInput,
  opts: { ip: string; userId?: string | null },
): Promise<{ ticket: SupportTicketView; accessToken: string }> {
  checkRateLimit(`support:create:${opts.ip}`, SUPPORT_LIMITS.createMaxPerWindow, SUPPORT_LIMITS.createWindowSeconds);

  return withTransaction(pool, async (tx) => {
    let orderId: string | null = null;
    if (input.orderNumberInput) {
      const { rows } = (await tx.execute(sql`
        SELECT id FROM orders WHERE lower(order_number) = lower(${input.orderNumberInput}) LIMIT 1
      `)) as unknown as { rows: { id: string }[] };
      orderId = rows[0]?.id ?? null;
    }

    const ticketNumber = generateTicketNumber();
    const token = createOpaqueToken();

    const { rows: inserted } = (await tx.execute(sql`
      INSERT INTO support_tickets
        (ticket_number, access_token_hash, user_id, email, category, order_id, order_number_input)
      VALUES
        (${ticketNumber}, ${token.hash}, ${opts.userId ?? null}::uuid, ${input.email}, ${input.category}::support_ticket_category,
         ${orderId}::uuid, ${input.orderNumberInput ?? null})
      RETURNING id
    `)) as unknown as { rows: { id: string }[] };
    const ticketId = inserted[0]!.id;

    await tx.execute(sql`
      INSERT INTO support_messages (ticket_id, sender_type, sender_user_id, body)
      VALUES (${ticketId}::uuid, 'CUSTOMER', ${opts.userId ?? null}::uuid, ${input.message})
    `);

    const { rows } = (await tx.execute(sql`${TICKET_SELECT} WHERE t.id = ${ticketId}::uuid`)) as unknown as {
      rows: TicketRow[];
    };
    return { ticket: toTicketView(rows[0]!), accessToken: token.value };
  });
}

export async function getTicketByAccessToken(pool: Pool, accessToken: string): Promise<SupportTicketView | null> {
  const db = createDb(pool);
  const { rows } = (await db.execute(sql`${TICKET_SELECT} WHERE t.access_token_hash = ${hashToken(accessToken)}`)) as unknown as {
    rows: TicketRow[];
  };
  return rows[0] ? toTicketView(rows[0]) : null;
}

/** Acceso autenticado: mismo criterio IDOR que `getOrderForUser` — ajeno o inexistente dan `null` por igual. */
export async function getTicketForUser(pool: Pool, userId: string, ticketId: string): Promise<SupportTicketView | null> {
  const db = createDb(pool);
  const { rows } = (await db.execute(
    sql`${TICKET_SELECT} WHERE t.id = ${ticketId}::uuid AND t.user_id = ${userId}::uuid`,
  )) as unknown as { rows: TicketRow[] };
  return rows[0] ? toTicketView(rows[0]) : null;
}

export async function listTicketsForUser(pool: Pool, userId: string): Promise<SupportTicketView[]> {
  const db = createDb(pool);
  const { rows } = (await db.execute(
    sql`${TICKET_SELECT} WHERE t.user_id = ${userId}::uuid ORDER BY t.last_message_at DESC`,
  )) as unknown as { rows: TicketRow[] };
  return rows.map(toTicketView);
}

export async function listMessages(db: Db, ticketId: string): Promise<SupportMessageView[]> {
  const { rows } = (await db.execute(sql`
    SELECT id, ticket_id, sender_type, sender_user_id, body, created_at
      FROM support_messages
     WHERE ticket_id = ${ticketId}::uuid
     ORDER BY created_at ASC
  `)) as unknown as {
    rows: { id: string; ticket_id: string; sender_type: "CUSTOMER" | "ADMIN"; sender_user_id: string | null; body: string; created_at: string }[];
  };
  return rows.map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    senderType: r.sender_type,
    senderUserId: r.sender_user_id,
    body: r.body,
    createdAt: new Date(r.created_at),
  }));
}

/** Inserta la respuesta del cliente y reabre el ticket si estaba RESOLVED/CLOSED — volver a escribir claramente dice que no se dio por resuelto. Asume que `tx` corre dentro de una transacción abierta por el llamador. */
async function appendCustomerReply(
  tx: Db,
  ticketId: string,
  currentStatus: string,
  senderUserId: string | null,
  body: string,
): Promise<SupportTicketView> {
  await tx.execute(sql`
    INSERT INTO support_messages (ticket_id, sender_type, sender_user_id, body)
    VALUES (${ticketId}::uuid, 'CUSTOMER', ${senderUserId}::uuid, ${body})
  `);

  const reopenStatus = currentStatus === "RESOLVED" || currentStatus === "CLOSED" ? sql`'OPEN'` : sql`status`;
  await tx.execute(sql`
    UPDATE support_tickets
       SET status = ${reopenStatus}, last_message_at = now(), updated_at = now()
     WHERE id = ${ticketId}::uuid
  `);

  const { rows: updated } = (await tx.execute(sql`${TICKET_SELECT} WHERE t.id = ${ticketId}::uuid`)) as unknown as {
    rows: TicketRow[];
  };
  return toTicketView(updated[0]!);
}

/** Respuesta de invitado (o de cualquiera con el link): la prueba de propiedad es el token, igual que `getOrderByAccessToken`. */
export async function addCustomerMessage(
  pool: Pool,
  accessToken: string,
  body: string,
  opts: { ip: string },
): Promise<SupportTicketView> {
  checkRateLimit(`support:message:${opts.ip}`, SUPPORT_LIMITS.messageMaxPerWindow, SUPPORT_LIMITS.messageWindowSeconds);

  return withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(sql`
      SELECT id, user_id, status FROM support_tickets WHERE access_token_hash = ${hashToken(accessToken)}
    `)) as unknown as { rows: { id: string; user_id: string | null; status: string }[] };
    const row = rows[0];
    if (!row) throw new InvalidTicketTokenError();

    return appendCustomerReply(tx, row.id, row.status, row.user_id, body);
  });
}

/** Respuesta de un usuario logueado sin token a mano (`/cuenta/soporte/[id]`) — mismo criterio IDOR que `getOrderForUser`. */
export async function addCustomerMessageForUser(
  pool: Pool,
  userId: string,
  ticketId: string,
  body: string,
  opts: { ip: string },
): Promise<SupportTicketView> {
  checkRateLimit(`support:message:${opts.ip}`, SUPPORT_LIMITS.messageMaxPerWindow, SUPPORT_LIMITS.messageWindowSeconds);

  return withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(sql`
      SELECT id, status FROM support_tickets WHERE id = ${ticketId}::uuid AND user_id = ${userId}::uuid
    `)) as unknown as { rows: { id: string; status: string }[] };
    const row = rows[0];
    if (!row) throw new SupportTicketNotFoundError(ticketId);

    return appendCustomerReply(tx, row.id, row.status, userId, body);
  });
}

/** Primera respuesta de un admin/SUPPORT: pasa el ticket a IN_PROGRESS y se autoasigna si nadie lo tenía. */
export async function addAdminMessage(pool: Pool, ticketId: string, adminUserId: string, body: string): Promise<SupportTicketView> {
  return withTransaction(pool, async (tx) => {
    const { rows } = (await tx.execute(sql`
      SELECT id, status, assigned_to FROM support_tickets WHERE id = ${ticketId}::uuid
    `)) as unknown as { rows: { id: string; status: string; assigned_to: string | null }[] };
    const row = rows[0];
    if (!row) throw new SupportTicketNotFoundError(ticketId);

    await tx.execute(sql`
      INSERT INTO support_messages (ticket_id, sender_type, sender_user_id, body)
      VALUES (${row.id}::uuid, 'ADMIN', ${adminUserId}::uuid, ${body})
    `);

    const nextStatus = row.status === "OPEN" ? sql`'IN_PROGRESS'` : sql`status`;
    const nextAssignee = row.assigned_to ? sql`assigned_to` : sql`${adminUserId}::uuid`;
    await tx.execute(sql`
      UPDATE support_tickets
         SET status = ${nextStatus}, assigned_to = ${nextAssignee}, last_message_at = now(), updated_at = now()
       WHERE id = ${row.id}::uuid
    `);

    const { rows: updated } = (await tx.execute(sql`${TICKET_SELECT} WHERE t.id = ${row.id}::uuid`)) as unknown as {
      rows: TicketRow[];
    };
    return toTicketView(updated[0]!);
  });
}

export async function updateTicketAdmin(
  db: Db,
  ticketId: string,
  patch: { status?: string; assignedTo?: string | null },
): Promise<SupportTicketView> {
  const { rows: existing } = (await db.execute(sql`SELECT id FROM support_tickets WHERE id = ${ticketId}::uuid`)) as unknown as {
    rows: { id: string }[];
  };
  if (!existing[0]) throw new SupportTicketNotFoundError(ticketId);

  if (patch.status !== undefined) {
    await db.execute(sql`
      UPDATE support_tickets SET status = ${patch.status}::support_ticket_status, updated_at = now() WHERE id = ${ticketId}::uuid
    `);
  }
  if (patch.assignedTo !== undefined) {
    await db.execute(sql`
      UPDATE support_tickets SET assigned_to = ${patch.assignedTo}::uuid, updated_at = now() WHERE id = ${ticketId}::uuid
    `);
  }

  const { rows } = (await db.execute(sql`${TICKET_SELECT} WHERE t.id = ${ticketId}::uuid`)) as unknown as {
    rows: TicketRow[];
  };
  return toTicketView(rows[0]!);
}

export interface AdminTicketListFilters {
  status?: string;
  q?: string;
}

export async function listTicketsAdmin(db: Db, filters: AdminTicketListFilters): Promise<SupportTicketView[]> {
  const conditions = [sql`1=1`];
  if (filters.status) conditions.push(sql`t.status = ${filters.status}`);
  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(sql`(t.ticket_number ILIKE ${like} OR t.email ILIKE ${like} OR o.order_number ILIKE ${like})`);
  }
  const where = conditions.reduce((acc, c) => sql`${acc} AND ${c}`);

  const { rows } = (await db.execute(
    sql`${TICKET_SELECT} WHERE ${where} ORDER BY t.last_message_at DESC LIMIT 200`,
  )) as unknown as { rows: TicketRow[] };
  return rows.map(toTicketView);
}

export async function getTicketAdmin(db: Db, ticketId: string): Promise<SupportTicketView | null> {
  const { rows } = (await db.execute(sql`${TICKET_SELECT} WHERE t.id = ${ticketId}::uuid`)) as unknown as {
    rows: TicketRow[];
  };
  return rows[0] ? toTicketView(rows[0]) : null;
}

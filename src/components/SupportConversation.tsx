"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./SupportConversation.module.css";
import { ArrowLeftIcon } from "./icons";
import { StatusPill } from "./StatusPill";
import { SUPPORT_CATEGORY_LABEL, SUPPORT_STATUS_LABEL, SUPPORT_STATUS_TONE, type SupportCategory } from "@/lib/support";

interface TicketView {
  id: string;
  ticketNumber: string;
  status: string;
  category: string;
  orderNumber: string | null;
}

interface MessageView {
  id: string;
  senderType: "CUSTOMER" | "ADMIN";
  body: string;
  createdAt: string;
}

/** Sondeo simple cada 8s mientras la pestaña está abierta — alcanza para que la respuesta de soporte aparezca sin recargar, sin meter WebSockets a un sitio que no los tiene en ningún otro lado. */
const POLL_MS = 8000;

/**
 * Hilo de conversación reutilizado por `/ayuda/ticket/[id]` (invitado, con
 * `?token=` en la URL) y `/cuenta/soporte/[id]` (logueado, sin token). El
 * modo se decide solo por si hay `accessToken` disponible.
 */
export function SupportConversation({ ticketId }: { ticketId: string }) {
  const searchParams = useSearchParams();
  const accessToken = searchParams.get("token") ?? undefined;

  const [ticket, setTicket] = useState<TicketView | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const fetchUrl = accessToken
    ? `/api/support/tickets/token/${encodeURIComponent(accessToken)}`
    : `/api/support/tickets/${encodeURIComponent(ticketId)}`;
  const replyUrl = accessToken
    ? `/api/support/tickets/token/${encodeURIComponent(accessToken)}/messages`
    : `/api/support/tickets/${encodeURIComponent(ticketId)}`;

  const load = useCallback(
    async (silent = false) => {
      try {
        const response = await fetch(fetchUrl, { cache: "no-store" });
        if (!response.ok) {
          if (!silent) setNotFound(true);
          return;
        }
        const body = await response.json();
        setTicket(body.ticket);
        setMessages(body.messages);
      } catch {
        if (!silent) setNotFound(true);
      }
    },
    [fetchUrl],
  );

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(true), POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(replyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "No pudimos enviar tu mensaje.");
        return;
      }
      setTicket(data.ticket);
      setMessages(data.messages);
      setReply("");
    } catch {
      setError("No pudimos enviar tu mensaje.");
    } finally {
      setSending(false);
    }
  }

  if (notFound) {
    return (
      <main className={styles.main}>
        <div className={styles.notFound}>
          <h1>No encontramos esta conversación</h1>
          <p>Puede que el enlace sea incorrecto o esté en otro navegador.</p>
          <Link href="/ayuda" className="btn btnPrimary">
            Volver a Ayuda
          </Link>
        </div>
      </main>
    );
  }

  if (!ticket) return null;

  const closed = ticket.status === "CLOSED";

  return (
    <main className={styles.main}>
      <Link href="/ayuda" className={styles.crumb}>
        <ArrowLeftIcon /> Volver a Ayuda
      </Link>

      <div className={styles.head}>
        <h1>{SUPPORT_CATEGORY_LABEL[ticket.category as SupportCategory] ?? "Tu conversación"}</h1>
        <StatusPill tone={SUPPORT_STATUS_TONE[ticket.status] ?? "neutral"}>
          {SUPPORT_STATUS_LABEL[ticket.status] ?? ticket.status}
        </StatusPill>
      </div>
      <p className={styles.sub}>
        Ticket #{ticket.ticketNumber}
        {ticket.orderNumber ? ` · Pedido #${ticket.orderNumber}` : ""}
      </p>

      <div className={styles.thread}>
        {messages.map((m) => (
          <div key={m.id} className={`${styles.message} ${m.senderType === "CUSTOMER" ? styles.customer : styles.admin}`}>
            {m.body}
            <span className={styles.messageMeta}>
              {m.senderType === "ADMIN" ? "Soporte" : "Vos"} ·{" "}
              {new Date(m.createdAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
            </span>
          </div>
        ))}
        <div ref={threadEndRef} />
      </div>

      {closed ? (
        <p className={styles.closedNote}>Esta conversación está cerrada. Si necesitás algo más, creá una nueva desde Ayuda.</p>
      ) : (
        <form className={styles.replyForm} onSubmit={handleReply}>
          <textarea
            className={styles.textarea}
            placeholder="Escribí tu respuesta…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.replyRow}>
            <button type="submit" className="btn btnPrimary" disabled={sending || !reply.trim()}>
              {sending ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}

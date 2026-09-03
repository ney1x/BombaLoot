"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import shared from "@/app/admin/shared.module.css";
import { SUPPORT_STATUS_LABEL, SUPPORT_STATUS_TONE } from "@/lib/support";

interface TicketView {
  id: string;
  status: string;
  assignedTo: string | null;
  assignedToEmail: string | null;
}

interface MessageView {
  id: string;
  senderType: "CUSTOMER" | "ADMIN";
  body: string;
  createdAt: string;
}

const POLL_MS = 8000;
const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const MESSAGE_MAX = 4000;
const CONFIRM_MS = 2500;
/** "Escribiendo…" necesita sentirse en vivo — sondeo propio, más seguido que el de mensajes. */
const TYPING_POLL_MS = 2500;
/** A lo sumo un ping cada 3s mientras se sigue escribiendo. */
const TYPING_PING_THROTTLE_MS = 3000;

/** Hilo + respuesta + estado/asignación, todo en una página — el pedido explícito de que admin y cliente conversen sin salir del panel. */
export function AdminSupportThread({
  ticketId,
  currentUserId,
  currentUserEmail,
  initialTicket,
  initialMessages,
}: {
  ticketId: string;
  currentUserId: string;
  currentUserEmail: string;
  initialTicket: TicketView;
  initialMessages: MessageView[];
}) {
  const [ticket, setTicket] = useState<TicketView>(initialTicket);
  const [messages, setMessages] = useState<MessageView[]>(initialMessages);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [customerTyping, setCustomerTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingPingRef = useRef(0);

  useEffect(() => {
    if (!confirmMsg) return;
    const t = setTimeout(() => setConfirmMsg(null), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [confirmMsg]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/support/${ticketId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setTicket(data.ticket);
      setMessages(data.messages);
    } catch {
      // sondeo silencioso — un fallo puntual no interrumpe al admin
    }
  }, [ticketId]);

  useEffect(() => {
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  // Sondeo propio de "¿está escribiendo el cliente?" — mucho más seguido
  // que el de mensajes, y liviano (un solo booleano), así que no vale la
  // pena mezclarlo con `load`.
  useEffect(() => {
    let cancelled = false;
    async function pollTyping() {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/admin/support/${ticketId}/typing`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setCustomerTyping(Boolean(data.typing));
      } catch {
        // sondeo silencioso
      }
    }
    void pollTyping();
    const interval = setInterval(pollTyping, TYPING_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ticketId]);

  /** Throttleado — a lo sumo un POST cada `TYPING_PING_THROTTLE_MS`. */
  function pingTyping() {
    const now = Date.now();
    if (now - lastTypingPingRef.current < TYPING_PING_THROTTLE_MS) return;
    lastTypingPingRef.current = now;
    void fetch(`/api/admin/support/${ticketId}/typing`, { method: "POST" }).catch(() => {
      // best-effort
    });
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo enviar la respuesta");
        return;
      }
      setTicket(data.ticket);
      setMessages(data.messages);
      setReply("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch {
      setError("No se pudo enviar la respuesta");
    } finally {
      setSending(false);
    }
  }

  async function updateTicket(patch: Record<string, unknown>, confirmText: string) {
    setSavingStatus(true);
    setError(null);
    setConfirmMsg(null);
    try {
      const res = await fetch(`/api/admin/support/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo actualizar el ticket");
        return;
      }
      setTicket(data.ticket);
      setConfirmMsg(confirmText);
    } catch {
      setError("No se pudo actualizar el ticket");
    } finally {
      setSavingStatus(false);
    }
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className={shared.card} style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div className={shared.field} style={{ margin: 0 }}>
          <label htmlFor="status">Estado</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className={shared.badge} data-tone={SUPPORT_STATUS_TONE[ticket.status]}>
              {SUPPORT_STATUS_LABEL[ticket.status] ?? ticket.status}
            </span>
            <select
              id="status"
              value={ticket.status}
              disabled={savingStatus}
              onChange={(e) =>
                void updateTicket(
                  { status: e.target.value },
                  `Estado actualizado a "${SUPPORT_STATUS_LABEL[e.target.value] ?? e.target.value}".`,
                )
              }
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SUPPORT_STATUS_LABEL[s] ?? s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <span className={shared.subtitle} style={{ marginLeft: 4 }}>
          Asignado a: {ticket.assignedToEmail ?? "nadie todavía"}
        </span>

        {ticket.assignedTo !== currentUserId ? (
          <button
            type="button"
            className={shared.btnSmall}
            style={{ marginLeft: "auto" }}
            disabled={savingStatus}
            onClick={() => void updateTicket({ assignedTo: currentUserId }, "Te asignaste el ticket.")}
          >
            Asignarme
          </button>
        ) : (
          <button
            type="button"
            className={shared.btnSmall}
            style={{ marginLeft: "auto" }}
            disabled={savingStatus}
            onClick={() => void updateTicket({ assignedTo: null }, "Quitaste tu asignación.")}
          >
            Quitar mi asignación
          </button>
        )}
      </div>

      {error && (
        <div className={shared.formMsg} data-tone="bad">
          {error}
        </div>
      )}

      {confirmMsg && (
        <div className={shared.formMsg} data-tone="good" role="status">
          {confirmMsg}
        </div>
      )}

      <div className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.senderType === "ADMIN" ? "flex-end" : "flex-start",
              maxWidth: "80%",
              padding: "10px 13px",
              borderRadius: 10,
              fontSize: 14,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
              background: m.senderType === "ADMIN" ? "var(--accent)" : "var(--surface-2)",
              color: m.senderType === "ADMIN" ? "var(--accent-ink)" : "var(--ink)",
            }}
          >
            {m.body}
            <span style={{ display: "block", fontSize: 11, opacity: 0.75, marginTop: 6 }}>
              {m.senderType === "ADMIN" ? "Soporte" : "Cliente"} ·{" "}
              {new Date(m.createdAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
            </span>
          </div>
        ))}
        {messages.length === 0 && <span className={shared.subtitle}>Sin mensajes todavía.</span>}
        {customerTyping && (
          <div
            style={{
              alignSelf: "flex-start",
              padding: "10px 13px",
              borderRadius: 10,
              background: "var(--surface-2)",
              color: "var(--ink)",
            }}
            data-motion="essential"
            aria-live="polite"
            aria-label="El cliente está escribiendo"
          >
            <span className={shared.typingDots}>
              <span className={shared.typingDot} />
              <span className={shared.typingDot} />
              <span className={shared.typingDot} />
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleReply} className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className={shared.field} style={{ margin: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <label htmlFor="reply">Responder como {currentUserEmail}</label>
            <span
              className={shared.subtitle}
              style={{ color: reply.length > MESSAGE_MAX ? "var(--alert)" : undefined }}
            >
              {reply.length}/{MESSAGE_MAX}
            </span>
          </div>
          <textarea
            id="reply"
            ref={textareaRef}
            value={reply}
            onChange={(e) => {
              setReply(e.target.value);
              autoGrow(e.target);
              pingTyping();
            }}
            rows={4}
            style={{ resize: "vertical", overflow: "hidden", minHeight: 90 }}
          />
        </div>
        <div className={shared.actions}>
          <button
            type="submit"
            className={`${shared.btnSmall} ${shared.btnSmallPrimary}`}
            disabled={sending || !reply.trim() || reply.length > MESSAGE_MAX}
          >
            {sending ? "Enviando…" : "Enviar respuesta"}
          </button>
        </div>
      </form>
    </div>
  );
}

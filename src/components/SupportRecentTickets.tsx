"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listSavedTickets, type SavedTicketRef } from "@/lib/support-session";

/** Solo aparece si el navegador tiene tickets guardados — invitados que ya escribieron antes. */
export function SupportRecentTickets() {
  const [tickets, setTickets] = useState<SavedTicketRef[]>([]);

  useEffect(() => {
    setTickets(listSavedTickets());
  }, []);

  if (tickets.length === 0) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 8 }}>
        Tus conversaciones recientes en este navegador
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tickets.map((t) => (
          <Link
            key={t.id}
            href={`/ayuda/ticket/${t.id}?token=${encodeURIComponent(t.token)}`}
            // Mismo motivo que ProductTile/CatalogProductCard/OrderRow: cada
            // ticket guardado dispara su propio prefetch RSC (ruta dinámica,
            // token de invitado) apenas se renderiza la lista.
            prefetch={false}
            style={{
              fontSize: 13.5,
              fontFamily: "var(--font-mono)",
              color: "var(--accent)",
              textDecoration: "underline",
            }}
          >
            {t.ticketNumber}
          </Link>
        ))}
      </div>
    </div>
  );
}

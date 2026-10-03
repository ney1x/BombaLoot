import type { Metadata } from "next";
import { SupportConversation } from "@/components/SupportConversation";
import { requireUser } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Tu conversación — BombaLoot" };

/**
 * `requireUser` solo confirma que hay sesión — la propiedad real del
 * ticket la vuelve a chequear `SupportConversation` contra la API
 * (`getTicketForUser`, mismo criterio IDOR que el resto de /cuenta). No
 * usa `AccountShell` a propósito: el hilo de conversación necesita el
 * ancho angosto y centrado de `/ayuda/ticket/[id]`, no el layout de dos
 * columnas del resto de la cuenta.
 */
export default async function AccountSupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("/cuenta/soporte");
  const { id } = await params;
  return <SupportConversation ticketId={id} />;
}

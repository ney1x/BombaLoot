import type { Metadata } from "next";
import { SupportConversation } from "@/components/SupportConversation";

export const metadata: Metadata = { title: "Tu conversación — bombaloot" };

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SupportConversation ticketId={id} />;
}

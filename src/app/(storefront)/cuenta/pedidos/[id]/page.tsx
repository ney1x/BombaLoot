import type { Metadata } from "next";
import { AccountShell } from "@/components/AccountShell";
import { AccountOrderDetail } from "@/components/AccountOrderDetail";
import { requireUser } from "@/server/auth/guards";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Pedido #${id} — BombaLoot` };
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/cuenta/pedidos/${id}`);

  // Dueño y códigos se resuelven client-side vía /api/orders/[id] y
  // /api/orders/[id]/codes — la propia consulta de `getOrderForUser` ya
  // filtra por `user_id = session.userId` (IDOR: un pedido ajeno da el
  // mismo 404 que uno inexistente), así que no hace falta repetir el
  // chequeo acá.
  return (
    <AccountShell user={user}>
      <AccountOrderDetail orderId={id} />
    </AccountShell>
  );
}

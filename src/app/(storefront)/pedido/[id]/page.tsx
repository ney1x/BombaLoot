import type { Metadata } from "next";
import { OrderDeliveryView } from "@/components/OrderDeliveryView";
import { OrderDeliveryReal } from "@/components/OrderDeliveryReal";

/**
 * `id` real (creado por `/checkout`) es un UUID; `id` mock (fase de diseño
 * original, `MOCK_ORDERS`) tiene el formato corto `AAAA-1234`. Se elige el
 * componente por forma en vez de una ruta paralela, mismo criterio que
 * `/checkout/resultado/[status]`.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Pedido #${id} — BombaLoot` };
}

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return UUID_RE.test(id) ? <OrderDeliveryReal id={id} /> : <OrderDeliveryView id={id} />;
}

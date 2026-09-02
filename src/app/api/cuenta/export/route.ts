import { NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { listOrdersForUser } from "@/server/services/checkout-service";
import { listTicketsForUser } from "@/server/services/support-service";

/**
 * "Conocer qué información tenemos" (Política de Privacidad §9) en un solo
 * archivo — antes esto solo se podía pedir escribiendo a soporte a mano.
 * No incluye contraseña (nunca se guarda en texto plano, no hay nada que
 * exportar) ni el contenido de los códigos entregados (siguen cifrados en
 * `codes`, y ya se le mostraron al comprador en su momento en /pedido).
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const pool = getPool();
  const [orders, tickets] = await Promise.all([
    listOrdersForUser(pool, session.userId),
    listTicketsForUser(pool, session.userId),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    profile: {
      name: session.name,
      email: session.email,
      role: session.role,
      purchasesCount: session.purchasesCount,
    },
    orders: orders.map((o) => ({
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      totalCop: o.totalCop,
      paymentStatus: o.paymentStatus,
      deliveryStatus: o.deliveryStatus,
      items: o.items,
    })),
    supportTickets: tickets.map((t) => ({
      ticketNumber: t.ticketNumber,
      category: t.category,
      status: t.status,
      orderNumber: t.orderNumber,
      createdAt: t.createdAt,
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="bombaloot-mis-datos.json"`,
    },
  });
}

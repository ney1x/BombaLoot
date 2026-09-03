import type { Metadata } from "next";
import styles from "../account.module.css";
import { AccountShell } from "@/components/AccountShell";
import { EmptyState } from "@/components/EmptyState";
import { OrderRow } from "@/components/OrderRow";
import { ReceiptIcon } from "@/components/icons";
import { requireUser } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { listOrdersForUser } from "@/server/services/checkout-service";

export const metadata: Metadata = { title: "Mis compras — bombaloot" };

export default async function OrdersPage() {
  const user = await requireUser("/cuenta/pedidos");
  const orders = await listOrdersForUser(getPool(), user.userId);

  return (
    <AccountShell user={user}>
      <div className={styles.pageHead}>
        <h1>Mis compras</h1>
        <p>Todos tus pedidos, con su estado de pago y entrega.</p>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={ReceiptIcon}
          title="Todavía no hiciste ningún pedido"
          body="Cuando compres una denominación, tu pedido va a aparecer acá con su estado y el código correspondiente."
          actionHref="/catalogo"
          actionLabel="Explorar catálogo"
        />
      ) : (
        <div className={styles.orderList}>
          {orders.map((order) => (
            <OrderRow order={order} prefetch={false} key={order.orderId} />
          ))}
        </div>
      )}
    </AccountShell>
  );
}

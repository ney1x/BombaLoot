import type { Metadata } from "next";
import styles from "../account.module.css";
import { AccountShell } from "@/components/AccountShell";
import { EmptyState } from "@/components/EmptyState";
import { OrderRow } from "@/components/OrderRow";
import { ReceiptIcon } from "@/components/icons";
import { requireUser } from "@/server/auth/guards";
import { MOCK_ORDERS } from "@/lib/orders";

export const metadata: Metadata = { title: "Mis compras — Loadout" };

export default async function OrdersPage() {
  const user = await requireUser("/cuenta/pedidos");

  return (
    <AccountShell user={user}>
      <div className={styles.pageHead}>
        <h1>Mis compras</h1>
        <p>Todos tus pedidos, con su estado de pago y entrega.</p>
      </div>

      {MOCK_ORDERS.length === 0 ? (
        <EmptyState
          icon={ReceiptIcon}
          title="Todavía no hiciste ningún pedido"
          body="Cuando compres una denominación, tu pedido va a aparecer acá con su estado y el código correspondiente."
          actionHref="/catalogo"
          actionLabel="Explorar catálogo"
        />
      ) : (
        <div className={styles.orderList}>
          {MOCK_ORDERS.map((order) => (
            <OrderRow order={order} key={order.id} />
          ))}
        </div>
      )}
    </AccountShell>
  );
}

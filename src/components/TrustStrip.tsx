import styles from "./TrustStrip.module.css";
import { HistoryCheckIcon, PackageCheckIcon, ShieldCheckIcon } from "./icons";

const items = [
  {
    icon: ShieldCheckIcon,
    title: "Pago verificado en servidor",
    body: "Confirmamos con el proveedor antes de asignar un código.",
  },
  {
    icon: PackageCheckIcon,
    title: "Entrega automática",
    body: "Tu código queda en el pedido apenas se confirma el pago.",
  },
  {
    icon: HistoryCheckIcon,
    title: "Historial y soporte",
    body: "Todos tus pedidos, con o sin cuenta registrada.",
  },
];

export function TrustStrip() {
  return (
    <div className={styles.wrap}>
      <div className={styles.strip}>
        {items.map((item) => (
          <div className={styles.item} key={item.title}>
            <span className={styles.iconWrap}>
              <item.icon />
            </span>
            <div className={styles.copy}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import styles from "./StockBadge.module.css";
import type { StockState } from "@/lib/products";

const label: Record<StockState, string> = {
  available: "DISPONIBLE",
  low: "ÚLTIMAS",
  out: "AGOTADO",
};

export function StockBadge({
  stock,
  lowStockCount,
  tone = "default",
}: {
  stock: StockState;
  lowStockCount?: number;
  tone?: "default" | "onColor";
}) {
  const text = stock === "low" && lowStockCount ? `ÚLT. ${lowStockCount}` : label[stock];
  const toneClass = tone === "onColor" ? styles.onColor : "";
  return <span className={`${styles.badge} ${styles[stock]} ${toneClass}`}>{text}</span>;
}

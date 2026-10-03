import type { ReactNode } from "react";
import styles from "./StatusPill.module.css";

export function StatusPill({
  tone,
  children,
  icon,
}: {
  tone: "good" | "warn" | "bad" | "neutral";
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span className={`${styles.pill} ${styles[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

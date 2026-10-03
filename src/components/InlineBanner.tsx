import type { ReactNode } from "react";
import styles from "./InlineBanner.module.css";

export function InlineBanner({
  tone,
  icon,
  title,
  children,
}: {
  tone: "warn" | "bad" | "good" | "neutral";
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={`${styles.banner} ${styles[tone]}`}>
      <span className={styles.icon}>{icon}</span>
      <div>
        <h3>{title}</h3>
        {children && <div className={styles.body}>{children}</div>}
      </div>
    </div>
  );
}

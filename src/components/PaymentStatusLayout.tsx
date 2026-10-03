import type { ReactNode } from "react";
import styles from "./PaymentStatusLayout.module.css";

export function PaymentStatusLayout({
  tone,
  icon,
  title,
  subtitle,
  pulse,
  children,
}: {
  tone: "neutral" | "good" | "warn" | "bad";
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  pulse?: boolean;
  children?: ReactNode;
}) {
  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <span
          className={`${styles.iconBadge} ${styles[tone]} ${pulse ? styles.pulse : ""}`}
          data-motion={pulse ? "essential" : undefined}
        >
          {icon}
        </span>
        <h1>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children && <div className={styles.body}>{children}</div>}
      </div>
    </main>
  );
}

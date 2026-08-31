import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import styles from "./EmptyState.module.css";

export function EmptyState({
  icon: Icon,
  title,
  body,
  actionHref,
  actionLabel,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className={styles.wrap}>
      <span className={styles.iconWrap}>
        <Icon />
      </span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.body}>{body}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn btnPrimary">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

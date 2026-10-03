import type { ReactNode } from "react";
import styles from "./AuthLayout.module.css";
import { CheckIcon } from "./icons";

const BENEFITS = [
  "Historial de compras y acceso rápido a tus pedidos",
  "Fidelización: descuentos que suben con cada compra",
  "Perfil y datos guardados para la próxima vez",
];

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.panel}>
        <svg className={styles.panelPattern} aria-hidden="true">
          <defs>
            <pattern id="auth-dots" width="26" height="26" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.3" fill="#fff" fillOpacity="0.16" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#auth-dots)" />
        </svg>
        <div className={styles.panelContent}>
          <div className={styles.wordmark}>
            LOAD<span>OUT</span>
          </div>
          <h1>{title}</h1>
          <ul className={styles.benefits}>
            {BENEFITS.map((benefit) => (
              <li key={benefit}>
                <span className={styles.benefitIcon}>
                  <CheckIcon />
                </span>
                {benefit}
              </li>
            ))}
          </ul>
          <p className={styles.guestHint}>
            ¿Preferís no crear cuenta todavía? Podés comprar como invitado en cualquier momento — la
            cuenta nunca es obligatoria.
          </p>
        </div>
      </div>

      <div className={styles.formSide}>
        <div className={styles.formCard}>{children}</div>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./SecureAuthShell.module.css";
import { BombLootMark } from "./BombLootMark";
import { LockIcon } from "./icons";

/**
 * Shell de login — tarjeta única y centrada, sin el panel de marca al
 * costado que usa `AuthLayout` (registro/recuperar). Deliberadamente
 * angosto en alcance: solo el login lo usa, siguiendo el patrón de G2A
 * (login.g2a.com) — página de acceso aislada, con foco en confianza y
 * completar el formulario, no en venderte la cuenta mientras la llenás.
 */
export function SecureAuthShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.bar}>
        <span className={styles.secure}>
          <LockIcon />
          <span>Inicio de sesión seguro</span>
        </span>
        <Link href="/" className={styles.brand} aria-label="bombaloot — inicio">
          <BombLootMark />
          <span className={styles.wordmark}>
            bomba<span className={styles.wordmarkAccent}>loot</span>
          </span>
        </Link>
        <span className={styles.barSpacer} aria-hidden="true" />
      </div>

      <div className={styles.stage}>
        <div className={styles.card}>{children}</div>
      </div>

      <p className={styles.legal}>
        Al iniciar sesión confirmás que leíste y aceptás las{" "}
        <Link href="/soporte#reembolsos">condiciones de compra</Link>. Cómo tratamos tus datos personales
        está en la <Link href="/soporte#privacidad">política de privacidad</Link>.
      </p>
    </div>
  );
}

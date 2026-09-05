"use client";

import { useEffect, useState } from "react";
import paymentStyles from "./PaymentStatusLayout.module.css";
import styles from "./NequiPendingStatus.module.css";
import { CheckIcon, SmartphoneIcon } from "./icons";

/**
 * Espejo de `MAX_POLL_WINDOW_MS` en `PaymentResultReal` (9 min, la misma
 * ventana que Nequi le da a la persona para aprobar en su app) — el anillo
 * tiene que agotarse exactamente cuando el polling real deja de consultar,
 * no antes ni después.
 */
const MAX_SECONDS = 9 * 60;

const RADIUS = 31;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Estado "esperando aprobación en la app Nequi" — el único momento del
 * checkout donde el comprador tiene que salir del navegador y volver.
 * Reemplaza el badge genérico pulsante de `PaymentStatusLayout` por uno
 * propio (anillo de progreso real, acento magenta de Nequi, mini-stepper)
 * porque acá sí hace falta comunicar "esto sigue vivo y avanzando", no solo
 * "estamos esperando".
 */
export function NequiPendingStatus() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => Math.min(s + 1, MAX_SECONDS)), 1000);
    return () => clearInterval(id);
  }, []);

  const offset = CIRCUMFERENCE * (1 - elapsed / MAX_SECONDS);

  return (
    <main className={paymentStyles.main}>
      <div className={`${paymentStyles.card} ${styles.card}`}>
        <div className={styles.ringBadge}>
          <svg className={styles.ring} viewBox="0 0 68 68" aria-hidden="true">
            <circle className={styles.ringTrack} cx="34" cy="34" r={RADIUS} />
            <circle
              className={styles.ringProgress}
              cx="34"
              cy="34"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
            />
          </svg>
          <span className={styles.iconInner}>
            <SmartphoneIcon />
            <span className={styles.pingDot} />
          </span>
        </div>

        <h1>Aprobá el pago en tu app Nequi</h1>
        <p className={paymentStyles.subtitle}>
          Te mandamos una notificación — abrí Nequi y confirmá la transacción. Esta pantalla se
          actualiza sola apenas respondas, no cierres ni recargues.
        </p>

        <ol className={styles.steps}>
          <li className={styles.stepDone}>
            <span className={styles.stepDot}>
              <CheckIcon />
            </span>
            Pago iniciado
          </li>
          <li className={styles.stepActive}>
            <span className={styles.stepDot} />
            Esperando tu confirmación
          </li>
          <li className={styles.stepPending}>
            <span className={styles.stepDot} />
            Listo
          </li>
        </ol>

        <p className={styles.pollLine}>
          Consultando con Nequi{elapsed > 0 ? ` — hace ${elapsed}s` : "…"}
        </p>
      </div>
    </main>
  );
}

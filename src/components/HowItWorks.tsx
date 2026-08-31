"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./HowItWorks.module.css";

const STEPS = [
  {
    title: "Elegís y pagás",
    body: "Seleccioná la denominación exacta y pagá con Nequi/Wompi o PayPal, con o sin cuenta.",
  },
  {
    title: "Confirmamos con el proveedor",
    body: "El pago se valida directamente con el proveedor antes de asignarte un código.",
  },
  {
    title: "Recibís tu código",
    body: "Aparece en tu pedido al instante — y por email como respaldo.",
  },
];

/**
 * Los 3 pasos son literalmente una mecha: se "encienden" en secuencia
 * cuando la sección entra en viewport — mismo lenguaje de ignición que la
 * marca en el header (BombLootMark), no un efecto nuevo inventado acá.
 * Dispara una sola vez; no repite en cada scroll.
 */
export function HowItWorks() {
  const [ignited, setIgnited] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIgnited(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`${styles.steps} ${ignited ? styles.ignited : ""}`} ref={ref}>
      <div className={styles.fuseLine} aria-hidden="true" />
      {STEPS.map((step, i) => (
        <div className={styles.step} key={step.title}>
          <span className={styles.stepNum} style={{ animationDelay: `${i * 150}ms` }}>
            {i + 1}
          </span>
          <div>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

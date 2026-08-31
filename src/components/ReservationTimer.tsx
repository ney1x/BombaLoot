"use client";

import { useEffect, useState } from "react";
import styles from "./ReservationTimer.module.css";
import { ClockIcon } from "./icons";

export function ReservationTimer({
  durationSeconds,
  forceExpired = false,
  onExpire,
}: {
  durationSeconds: number;
  forceExpired?: boolean;
  onExpire?: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const expired = forceExpired || secondsLeft <= 0;

  useEffect(() => {
    if (forceExpired) return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [forceExpired]);

  useEffect(() => {
    if (expired) onExpire?.();
    // Fires once when the countdown (or a forced demo override) reaches zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  if (expired) return null;

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const urgent = secondsLeft <= 60;

  return (
    <div className={`${styles.pill} ${urgent ? styles.urgent : ""}`} role="status">
      <ClockIcon />
      <span>
        Tu reserva está activa durante{" "}
        <b className="num-display">
          {mm}:{ss}
        </b>
      </span>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import styles from "./ThemeToggle.module.css";
import { MoonIcon, SunIcon } from "./icons";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Lectura client-only (el script inline de `layout.tsx` ya fijó
    // `dataset.theme` antes de la hidratación) — corre una sola vez al
    // montar para sincronizar el estado visual del switch con lo que el
    // DOM ya tiene, no para reaccionar a cambios externos continuos.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.dataset.theme === "dark");
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("loadout-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      type="button"
      className={styles.track}
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
    >
      <SunIcon className={`${styles.icon} ${styles.iconSun}`} />
      <MoonIcon className={`${styles.icon} ${styles.iconMoon}`} />
      <span className={styles.knob}>{isDark ? <MoonIcon /> : <SunIcon />}</span>
    </button>
  );
}

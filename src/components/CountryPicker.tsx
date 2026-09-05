"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./CountryPicker.module.css";
import { ChevronDownIcon } from "./icons";
import { COUNTRY_COOKIE_NAME, SUPPORTED_COUNTRIES, countryFlagEmoji } from "@/lib/currency";

const DEFAULT_CODE = "CO";
const DEFAULT_LABEL = "Colombia";

/** Un año — mismo criterio que la cookie de tema (`loadout-theme`), es una preferencia de UI, no una sesión. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function readCountryCookie(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COUNTRY_COOKIE_NAME}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  if (value && (value === DEFAULT_CODE || SUPPORTED_COUNTRIES.some((c) => c.code === value))) return value;
  return DEFAULT_CODE;
}

/**
 * Selector manual de país — corrige la detección automática por IP
 * (`x-vercel-ip-country`, ver `@/server/services/geo-price`) cuando falla
 * (VPN, iCloud Private Relay, geolocalización imperfecta: el caso real que
 * lo motivó fue un visitante en México que veía precios sin convertir).
 *
 * Como el precio se calcula en el servidor a partir de una cookie, elegir
 * un país acá no cambia nada visualmente hasta que `router.refresh()`
 * vuelve a pedir la página — mismo patrón que cualquier preferencia que
 * afecta el render del servidor, no un estado que viva solo en el cliente.
 *
 * Lectura del valor actual client-only (como `ThemeToggle`): en SSR no hay
 * forma de saber la cookie sin volver dinámica toda la barra global, así
 * que arranca en "Colombia" y se corrige apenas monta — mismo flash
 * aceptable ya establecido para el tema.
 */
export function CountryPicker() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(DEFAULT_CODE);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(readCountryCookie());
  }, []);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function choose(nextCode: string) {
    document.cookie = `${COUNTRY_COOKIE_NAME}=${nextCode}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    setCode(nextCode);
    setOpen(false);
    router.refresh();
  }

  const currentLabel =
    code === DEFAULT_CODE ? DEFAULT_LABEL : (SUPPORTED_COUNTRIES.find((c) => c.code === code)?.label ?? DEFAULT_LABEL);
  const currentFlag = countryFlagEmoji(code);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`País: ${currentLabel}. Cambiar país para ver precios convertidos`}
        title="Cambiar país"
      >
        <span aria-hidden="true">{currentFlag}</span>
        <span className={styles.code}>{code}</span>
        <ChevronDownIcon className={styles.chevron} aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.dropdown} role="listbox" aria-label="Elegir país">
          <button
            type="button"
            role="option"
            aria-selected={code === DEFAULT_CODE}
            className={`${styles.option} ${code === DEFAULT_CODE ? styles.optionActive : ""}`}
            onClick={() => choose(DEFAULT_CODE)}
          >
            <span aria-hidden="true">{countryFlagEmoji(DEFAULT_CODE)}</span>
            {DEFAULT_LABEL} <span className={styles.optionCurrency}>COP</span>
          </button>
          <div className={styles.divider} />
          {SUPPORTED_COUNTRIES.map((c) => (
            <button
              key={c.code}
              type="button"
              role="option"
              aria-selected={code === c.code}
              className={`${styles.option} ${code === c.code ? styles.optionActive : ""}`}
              onClick={() => choose(c.code)}
            >
              <span aria-hidden="true">{countryFlagEmoji(c.code)}</span>
              {c.label} <span className={styles.optionCurrency}>{c.currency}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

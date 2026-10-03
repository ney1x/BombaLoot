"use client";

import { useState } from "react";
import styles from "./CodeReveal.module.css";
import { CheckIcon, CopyIcon } from "./icons";

export function CodeReveal({ code }: { code: string }) {
  const [state, setState] = useState<"hidden" | "loading" | "shown">("hidden");
  const [copied, setCopied] = useState(false);

  function reveal() {
    setState("loading");
    setTimeout(() => setState("shown"), 550);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  if (state === "hidden") {
    return (
      <div className={styles.wrap}>
        <button type="button" className={styles.trigger} onClick={reveal}>
          Ver código →
        </button>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className={styles.wrap}>
        <div className={styles.skeleton} aria-label="Cargando código" role="status" />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.reveal}>
        <span className={styles.code}>{code}</span>
        <button
          type="button"
          className={`${styles.copyBtn} ${copied ? styles.copied : ""}`}
          onClick={copy}
          aria-label="Copiar código"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

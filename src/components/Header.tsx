"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./Header.module.css";
import { BombLootMark } from "./BombLootMark";
import { CartIcon, CloseIcon, LogOutIcon, SearchIcon, ShieldCheckIcon, UserIcon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { useCart } from "@/lib/cart-context";
import { useSession } from "@/lib/session-context";
import { GAMES, GAME_COLORS } from "@/lib/products";

/**
 * Dropdown de juegos, compartido entre el buscador desktop y mobile — antes
 * era JSX duplicado en los dos lugares, con `role="listbox"` pero sin
 * ninguna de las teclas que ese rol implica. Ahora es `menu`/`menuitem`
 * real: flechas mueven el foco entre juegos, Escape cierra y devuelve el
 * foco al input.
 */
function GamesDropdown({
  onClose,
  onEscape,
}: {
  onClose: () => void;
  /** Distinto de onClose: además de cerrar, devuelve el foco al input —
      separado a propósito porque el input reabre el menú en su propio
      onFocus, así que quien reabre necesita saber que este foco viene de
      un Escape, no de un click real del usuario en el campo. */
  onEscape: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const options = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]') ?? []);
    const currentIndex = options.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      (options[currentIndex + 1] ?? options[0])?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      (options[currentIndex - 1] ?? options[options.length - 1])?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
    }
  }

  return (
    <div className={styles.gamesDropdown} role="menu" aria-label="Juegos" ref={listRef} onKeyDown={handleKeyDown}>
      <span className={styles.gamesDropdownLabel}>Ir directo a un juego</span>
      {GAMES.map((game) => (
        <Link
          key={game.id}
          href={`/catalogo/${game.id}`}
          role="menuitem"
          className={styles.gameOption}
          onClick={onClose}
        >
          <span className={styles.gameDot} style={{ background: GAME_COLORS[game.id].base }} />
          <span className={styles.gameOptionLabel}>{game.label}</span>
        </Link>
      ))}
    </div>
  );
}

export function Header() {
  const router = useRouter();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [mobileGamesOpen, setMobileGamesOpen] = useState(false);
  const [fuseLit, setFuseLit] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const suppressGamesReopenRef = useRef(false);
  const { count } = useCart();
  const { user, setUser } = useSession();
  const prevCountRef = useRef(count);

  function focusInputAfterEscape(inputRef: React.RefObject<HTMLInputElement | null>) {
    suppressGamesReopenRef.current = true;
    inputRef.current?.focus();
  }

  // La mecha "prende" cada vez que el carrito SUMA unidades — nunca al
  // bajar o al hidratar desde localStorage en el primer render.
  useEffect(() => {
    if (count > prevCountRef.current) {
      setFuseLit(true);
      const id = setTimeout(() => setFuseLit(false), 650);
      prevCountRef.current = count;
      return () => clearTimeout(id);
    }
    prevCountRef.current = count;
  }, [count]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  }

  useEffect(() => {
    if (mobileSearchOpen) mobileInputRef.current?.focus();
  }, [mobileSearchOpen]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) setGamesOpen(false);
      if (mobileSearchRef.current && !mobileSearchRef.current.contains(target)) setMobileGamesOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <header className={styles.bar}>
      <div className={`${styles.inner} ${mobileSearchOpen ? styles.searchMode : ""}`}>
        <div className={styles.brandGroup}>
          <Link href="/" className={styles.logo} aria-label="BombaLoot — inicio">
            <span className={styles.wordmark}>
              Bomba<span className={styles.wordmarkAccent}>Loot</span>
            </span>
            <BombLootMark lit={fuseLit} />
          </Link>
          <span className={styles.trustTag}>
            <ShieldCheckIcon />
            Compra protegida
          </span>
        </div>

        <div className={styles.searchWrap} ref={searchRef}>
          <SearchIcon className={styles.searchIcon} />
          <input
            ref={desktopInputRef}
            className={styles.searchInput}
            type="search"
            placeholder="Buscar producto o juego"
            aria-label="Buscar producto o juego"
            onFocus={() => {
              if (suppressGamesReopenRef.current) {
                suppressGamesReopenRef.current = false;
                return;
              }
              setGamesOpen(true);
            }}
          />
          {gamesOpen && (
            <GamesDropdown
              onClose={() => setGamesOpen(false)}
              onEscape={() => {
                setGamesOpen(false);
                focusInputAfterEscape(desktopInputRef);
              }}
            />
          )}
        </div>

        <div className={styles.mobileSearchWrap} ref={mobileSearchRef}>
          <SearchIcon className={styles.searchIcon} />
          <input
            ref={mobileInputRef}
            className={styles.searchInput}
            type="search"
            placeholder="Buscar producto o juego"
            aria-label="Buscar producto o juego"
            onFocus={() => {
              if (suppressGamesReopenRef.current) {
                suppressGamesReopenRef.current = false;
                return;
              }
              setMobileGamesOpen(true);
            }}
          />
          {mobileGamesOpen && (
            <GamesDropdown
              onClose={() => {
                setMobileGamesOpen(false);
                setMobileSearchOpen(false);
              }}
              onEscape={() => {
                setMobileGamesOpen(false);
                focusInputAfterEscape(mobileInputRef);
              }}
            />
          )}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.mobileOnly}`}
            aria-label={mobileSearchOpen ? "Cerrar búsqueda" : "Buscar"}
            aria-expanded={mobileSearchOpen}
            onClick={() => setMobileSearchOpen((open) => !open)}
          >
            {mobileSearchOpen ? <CloseIcon /> : <SearchIcon />}
          </button>
          <span className={styles.themeToggleWrap}>
            <ThemeToggle />
          </span>
          <div className={styles.sessionGroup}>
            <Link
              href="/carrito"
              className={styles.iconBtn}
              aria-label={`Carrito, ${count} ${count === 1 ? "producto" : "productos"}`}
            >
              <CartIcon />
              {count > 0 && (
                <span className={`${styles.cartCount} ${fuseLit ? styles.cartCountBump : ""}`}>
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Link>
            <Link
              href={user ? "/cuenta" : "/cuenta/login"}
              className={styles.iconBtn}
              title={user ? "Mi cuenta" : "Iniciar sesión"}
              aria-label={user ? `Mi cuenta — ${user.name?.trim() || user.email}` : "Iniciar sesión"}
            >
              <UserIcon />
              {user && <span className={styles.accountDot} aria-hidden="true" />}
            </Link>
            {user && (
              <button
                type="button"
                className={styles.iconBtn}
                aria-label="Cerrar sesión"
                onClick={handleLogout}
              >
                <LogOutIcon />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./Header.module.css";
import { BombLootMark } from "./BombLootMark";
import { CartIcon, CloseIcon, LogOutIcon, SearchIcon, UserIcon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { useCart } from "@/lib/cart-context";
import { useSession } from "@/lib/session-context";
import { GAMES, GAME_COLORS } from "@/lib/products";

export function Header() {
  const router = useRouter();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [mobileGamesOpen, setMobileGamesOpen] = useState(false);
  const [fuseLit, setFuseLit] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const { count } = useCart();
  const { user, setUser } = useSession();
  const prevCountRef = useRef(count);

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
        <Link href="/" className={styles.logo} aria-label="bombaloot — inicio">
          <BombLootMark lit={fuseLit} />
          <span className={styles.wordmark}>
            bomba<span className={styles.wordmarkAccent}>loot</span>
          </span>
        </Link>

        <div className={styles.searchWrap} ref={searchRef}>
          <SearchIcon className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Buscar producto o juego"
            aria-label="Buscar producto o juego"
            onFocus={() => setGamesOpen(true)}
          />
          {gamesOpen && (
            <div className={styles.gamesDropdown} role="listbox" aria-label="Juegos">
              <span className={styles.gamesDropdownLabel}>Ir directo a un juego</span>
              {GAMES.map((game) => (
                <Link
                  key={game.id}
                  href={`/catalogo/${game.id}`}
                  className={styles.gameOption}
                  onClick={() => setGamesOpen(false)}
                >
                  <span className={styles.gameDot} style={{ background: GAME_COLORS[game.id].base }} />
                  {game.label}
                </Link>
              ))}
            </div>
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
            onFocus={() => setMobileGamesOpen(true)}
          />
          {mobileGamesOpen && (
            <div className={styles.gamesDropdown} role="listbox" aria-label="Juegos">
              <span className={styles.gamesDropdownLabel}>Ir directo a un juego</span>
              {GAMES.map((game) => (
                <Link
                  key={game.id}
                  href={`/catalogo/${game.id}`}
                  className={styles.gameOption}
                  onClick={() => {
                    setMobileGamesOpen(false);
                    setMobileSearchOpen(false);
                  }}
                >
                  <span className={styles.gameDot} style={{ background: GAME_COLORS[game.id].base }} />
                  {game.label}
                </Link>
              ))}
            </div>
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
                <span className={`${styles.cartCount} ${fuseLit ? styles.cartCountBump : ""}`}>{count}</span>
              )}
            </Link>
            <Link href={user ? "/cuenta" : "/cuenta/login"} className={styles.accountBtn}>
              <UserIcon />
              <span className={styles.accountLabel}>{user ? user.name?.split(" ")[0] || "Mi cuenta" : "Iniciar sesión"}</span>
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

"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Sesión del lado del cliente — SOLO para pintar la UI (Header, etc), nunca
 * para decidir autorización. La verdad vive en el servidor: cualquier
 * página bajo /cuenta que de verdad necesita proteger contenido llama
 * `requireUser()` server-side (`src/server/auth/guards.ts`), no lee esto.
 * Este contexto puede mostrar por un instante el estado viejo (por ejemplo
 * al cerrar sesión en otra pestaña) sin que eso sea un problema de
 * seguridad — es solo la cookie httpOnly + la tabla `sessions` la que
 * importa para acceso real a datos.
 */

export interface SessionUser {
  name: string | null;
  email: string;
  role: string;
  purchasesCount: number;
}

interface SessionContextValue {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Actualiza el estado local sin golpear la red — lo usan login/registro/logout. */
  setUser: (user: SessionUser | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = (await res.json()) as { user: SessionUser | null };
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch de sesión al montar — asincrónico (el `setState` real ocurre
    // en el `.then`/`finally` de `refresh`, después del await), no un
    // `setState` síncrono dentro del cuerpo del efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ user, loading, refresh, setUser }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

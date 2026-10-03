import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Estado inicial del media query — client-only, no se puede conocer en
    // el render de servidor. El listener de abajo sí sincroniza con el
    // sistema externo (`matchMedia`) para cambios posteriores.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return reduced;
}

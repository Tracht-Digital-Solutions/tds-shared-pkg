import { useEffect, useState } from "react";

/**
 * `true` where the primary pointer is a finger. SSR-safe: `false` on the
 * server and on the first client render (so hydration matches), then the real
 * answer. Branch on the POINTER, not the width — a small desktop window has a
 * mouse, a large tablet does not. Same rule as ThemeToggle.
 *
 * Its own module, free of `motion`, so a component in the `./components`
 * barrel can use it without dragging the animation runtime into every page
 * that hydrates anything from that barrel. Re-exported by `./motion/react`.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    // Absent in jsdom and some embedded webviews: stay on the mouse default.
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(pointer: coarse)");
    setCoarse(query.matches);
    const onChange = (event: MediaQueryListEvent) => setCoarse(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return coarse;
}

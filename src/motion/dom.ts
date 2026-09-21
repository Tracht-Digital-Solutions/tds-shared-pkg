/**
 * The vanilla half of the motion layer — `@tracht-digital-solutions/tds-shared/motion/dom`.
 *
 * For server-rendered public pages that want Motion WITHOUT React: a CTA that
 * follows the pointer, a photo that settles into place, a page that leaves
 * before the next one arrives. `./motion/react` needs an island per element;
 * this entry works on plain Astro markup.
 *
 * Three rules for callers, the same lessons as `./motion/react`:
 *
 * 1. **Load it lazily.** `import()` it after first paint (idle callback), never
 *    statically from a page's critical path. It is the Motion runtime.
 * 2. **Never ship SSR content hidden.** A start state (`opacity: 0`, an
 *    offset) is set from JS, and only on elements that are not on screen yet —
 *    otherwise the visitor sees content vanish and come back, or waits for a
 *    script to see the headline at all (the landingpage's 4.1 s mobile LCP).
 * 3. **Check `prefersReducedMotion()` before mounting anything.** Under
 *    reduced motion the resting state is the only state.
 *
 * Consumers import from here and never from `motion` directly, so the pinned
 * version stays one copy in every tree.
 */
export { animate, inView, hover, press, scroll, stagger } from "motion";
export { ease, easeInOut, durations, transitions, spring } from "./index";

/**
 * A livelier spring for direct manipulation — a button following the pointer,
 * a card sliding out. Still no overshoot worth noticing: `bounce` 0.2 settles
 * in one visible swing.
 */
export const pointerSpring = {
  type: "spring",
  stiffness: 320,
  damping: 24,
  mass: 0.6,
} as const;

/** `true` when the visitor asked for less motion, or when there is no window. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** `true` on a device with a fine pointer that can hover — the only place pointer-follow effects belong. */
export function hasFinePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

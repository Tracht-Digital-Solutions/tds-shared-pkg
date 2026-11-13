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

/** How long a confirmation flag (`data-copied` / `data-done`) stays on a control. */
export const CONFIRM_FLAG_MS = 1500;

/**
 * Marks `el` as confirmed for `ms` — "copied", "saved", "sent". The flag
 * drives the one-shot `tds-confirm` pulse in `primitives.css` and is the
 * hook for a control's own "done" styling. Calling it again while the flag
 * is on restarts the pulse and the timer. Returns a function that clears the
 * flag early (call it on teardown).
 */
export function flagConfirmed(
  el: HTMLElement,
  kind: "copied" | "done" = "done",
  ms: number = CONFIRM_FLAG_MS,
): () => void {
  const attr = `data-${kind}`;
  const previous = confirmTimers.get(el);
  if (previous !== undefined) clearTimeout(previous);
  // Removing and re-adding in the same frame would not restart a CSS
  // animation; a forced style read between the two does.
  el.removeAttribute(attr);
  void el.offsetWidth;
  el.setAttribute(attr, "");
  const clear = () => {
    const timer = confirmTimers.get(el);
    if (timer !== undefined) clearTimeout(timer);
    confirmTimers.delete(el);
    el.removeAttribute(attr);
  };
  confirmTimers.set(el, setTimeout(clear, ms));
  return clear;
}
const confirmTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Counts a number up to the value the server already rendered, once, when it
 * scrolls into view. The markup always holds the final number, so a crawler,
 * a visitor without JS and a visitor who asked for less motion all read the
 * real value. The count only runs for an element that is NOT on screen yet
 * (rule 2 above): one already visible keeps its number. Returns a cleanup.
 *
 * The target is the first number in the element's text ("+8 Jahre" → 8);
 * the text around it is kept. Thousands separators follow `locale`.
 */
export function countUp(
  el: HTMLElement,
  { from = 0, durationMs = 900, locale }: { from?: number; durationMs?: number; locale?: string } = {},
): () => void {
  const text = el.textContent ?? "";
  const match = /\d[\d.,]*/.exec(text);
  if (!match || prefersReducedMotion() || isOnScreen(el)) return noop;
  const target = Number(match[0].replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
  if (!Number.isFinite(target) || target <= from) return noop;

  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  const format = new Intl.NumberFormat(locale ?? (document.documentElement.lang || undefined));
  const render = (value: number) => {
    el.textContent = `${before}${format.format(Math.round(value))}${after}`;
  };

  let frame = 0;
  render(from);
  const stopWatching = watchOnce(el, () => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      render(from + (target - from) * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
  return () => {
    stopWatching();
    cancelAnimationFrame(frame);
    el.textContent = text;
  };
}

function isOnScreen(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight;
}

function watchOnce(el: HTMLElement, onEnter: () => void): () => void {
  if (typeof IntersectionObserver === "undefined") {
    onEnter();
    return noop;
  }
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    onEnter();
  });
  observer.observe(el);
  return () => observer.disconnect();
}

function noop(): void {}

/** `true` on a device with a fine pointer that can hover — the only place pointer-follow effects belong. */
export function hasFinePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

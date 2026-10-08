/**
 * The error bounce: a field, button or message that has just gone wrong shakes
 * once from side to side — "no" in body language, the way a login screen of an
 * operating system refuses a password.
 *
 * Every TDS frontend gets it automatically through `errorBounceScript`
 * (`./astro`), which watches for errors appearing on the page. Call
 * {@link bounce} directly where an error does NOT change the markup — the same
 * message failing a second time, a button whose action failed without a visible
 * message — because then there is nothing for the watcher to see.
 *
 * Plain Web Animations, no Motion runtime: this module is safe on any page.
 */

/**
 * Side to side, decaying, back to rest. `translate` (not `transform`) and
 * composited with `add`, so it rides ON TOP of whatever the element already
 * does — a button lifted toward the pointer stays lifted while it shakes, and a
 * Motion transform is left alone.
 */
export const BOUNCE_KEYFRAMES: Keyframe[] = [
  { translate: "0px 0px" },
  { translate: "-7px 0px", offset: 0.16 },
  { translate: "6px 0px", offset: 0.36 },
  { translate: "-4px 0px", offset: 0.56 },
  { translate: "2px 0px", offset: 0.76 },
  { translate: "0px 0px" },
];

export const BOUNCE_OPTIONS: KeyframeAnimationOptions = {
  duration: 420,
  easing: "ease-out",
  composite: "add",
};

/** The global the inline script publishes, so both paths share one throttle. */
declare global {
  interface Window {
    __tdsBounce?: (el: Element | null | undefined) => void;
  }
}

/**
 * Shake `el` once. A no-op under `prefers-reduced-motion: reduce`, without a
 * window, or where Web Animations are missing (jsdom). Re-firing on an element
 * that is still shaking restarts it instead of stacking two.
 */
export function bounce(el: Element | null | undefined): void {
  if (!el || typeof window === "undefined") return;
  if (window.__tdsBounce) {
    window.__tdsBounce(el);
    return;
  }
  if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (typeof (el as Element & { animate?: unknown }).animate !== "function") return;
  for (const running of el.getAnimations?.() ?? []) {
    if ((running as Animation & { id?: string }).id === "tds-bounce") running.cancel();
  }
  const animation = el.animate(BOUNCE_KEYFRAMES, BOUNCE_OPTIONS);
  animation.id = "tds-bounce";
}

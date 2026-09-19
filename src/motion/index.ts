/**
 * Shared motion presets used site-wide. Frontends consume these via
 * `import { ease, fadeUp, ... } from "@tracht-digital-solutions/tds-shared/motion"`.
 *
 * Presets plus `transitionUpdate` (native View Transitions) — never the
 * `motion` runtime, so any page may import this entry for free.
 */
export { transitionUpdate, VIEW_TRANSITION_SCOPE } from "./viewTransition";

/**
 * Decelerates smoothly into the final position.
 *
 * MUST stay identical to `--tds-ease-out` in styles/base.css
 * (`cubic-bezier(0.2, 0.8, 0.2, 1)`). CSS transitions and framer-motion
 * springs share one curve on purpose — before the design library these
 * drifted apart, with the same easing hand-written at several different
 * values across the frontends. Change one, change both.
 */
export const ease = [0.2, 0.8, 0.2, 1] as const;

/**
 * The symmetric curve — `--tds-ease-in-out` in styles/base.css. Same
 * change-one-change-both rule as `ease` above.
 */
export const easeInOut = [0.4, 0, 0.2, 1] as const;

/**
 * The curves again as CSS strings, for the Web Animations API — which takes
 * an `easing` string, not a coefficient tuple, and cannot read a custom
 * property. `ThemeToggle` hand-wrote `cubic-bezier(0.4, 0, 0.2, 1)` inline
 * for exactly this reason, which is a third copy of a value that is supposed
 * to have one source.
 */
export const cssEase = {
  out: `cubic-bezier(${ease.join(", ")})`,
  inOut: `cubic-bezier(${easeInOut.join(", ")})`,
} as const;

/**
 * Durations in milliseconds, mirroring the `--tds-dur-*` scale in base.css.
 * For JS-driven animation only — CSS should reference the tokens directly.
 */
export const durations = {
  fast: 160,
  base: 200,
  slow: 320,
} as const;

/**
 * The same scale in SECONDS — the unit Motion's `transition.duration` takes.
 * Derived, not re-typed, so the two can never drift.
 */
export const transitions = {
  fast: { duration: durations.fast / 1000, ease },
  base: { duration: durations.base / 1000, ease },
  slow: { duration: durations.slow / 1000, ease },
} as const;

/**
 * A critically damped spring for `layout` moves (a list reflowing after a
 * row leaves, a tab indicator gliding). `bounce: 0` on purpose: the interface
 * settles, it does not wobble. `visualDuration` keeps it on the motion scale.
 */
export const spring = {
  type: "spring",
  bounce: 0,
  visualDuration: durations.slow / 1000,
} as const;

/**
 * Something swapping in place — list ↔ detail, one tab panel for another, a
 * form for its success message. A short fade with a 4px drift: enough to read
 * as "this changed", too little to read as "this moved".
 *
 * `enter` is only ever the EXIT target's mirror. The primitives in
 * `./motion/react` mount with `initial={false}`, so server-rendered content
 * is never shipped in this state — see `fadeUp` below for why that matters.
 */
export const presence = {
  enter: { opacity: 0, y: 4 },
  shown: { opacity: 1, y: 0, transition: transitions.base },
  exit: { opacity: 0, y: -4, transition: transitions.fast },
} as const;

/** A row joining or leaving a list: fades and slides in from the left edge. */
export const listItem = {
  enter: { opacity: 0, x: -8 },
  shown: { opacity: 1, x: 0, transition: transitions.base },
  exit: { opacity: 0, x: 8, transition: transitions.fast },
} as const;

/**
 * Standard "fade up on scroll-into-view" variant.
 *
 * NEVER use this on content that is server-rendered. An Astro island renders
 * `initial` into the SSR HTML as `style="opacity:0"`, so the element stays
 * invisible until the island hydrates — that is exactly how the landingpage
 * hero became its own mobile LCP (4.1s) before 0.31. For page sections use the
 * CSS `.tds-reveal` class; for React state changes use the `./motion/react`
 * primitives, which never animate their first mount.
 */
export const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
};

/** Container variant with staggered children. */
export const stagger = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

/** Quick fade for hover/tap microinteractions. */
export const microFade = {
  initial: { opacity: 0.6 },
  hover: { opacity: 1, transition: { duration: 0.2, ease } },
};

/**
 * Shared motion presets used site-wide. Frontends consume these via
 * `import { ease, fadeUp, ... } from "@tracht-digital-solutions/tds-shared/motion"`.
 */

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

/** Standard "fade up on scroll-into-view" variant. */
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

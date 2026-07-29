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

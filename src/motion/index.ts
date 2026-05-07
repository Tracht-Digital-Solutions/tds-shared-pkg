/**
 * Shared motion presets used site-wide. Frontends consume these via
 * `import { ease, fadeUp, ... } from "@tracht-digital-solutions/tds-shared/motion"`.
 */

/** Decelerates smoothly into the final position. */
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

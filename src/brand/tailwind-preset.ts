/**
 * Tailwind preset for all TDS frontends. Each frontend's
 * `tailwind.config.ts` should:
 *
 *   import preset from "@tracht-digital-solutions/tds-shared/brand/tailwind-preset";
 *   export default { presets: [preset], content: [...] };
 *
 * Keeps colour, font, and spacing tokens unified across the four
 * frontends without forcing them to duplicate config.
 */

import { brandColors, brandFonts } from "./tokens";

const preset = {
  theme: {
    extend: {
      colors: {
        primary: brandColors.primary,
        accent: brandColors.accent,
        paper: brandColors.paper,
        line: brandColors.line,
        muted: brandColors.muted,
        soft: brandColors.soft,
        "accent-pink": brandColors.accentPink,
      },
      fontFamily: {
        display: [brandFonts.display, "serif"],
        body: [brandFonts.body, "system-ui", "sans-serif"],
      },
    },
  },
};

export default preset;

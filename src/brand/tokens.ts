/**
 * TDS brand tokens — the source of truth for colours, type scale,
 * spacing, and motion timing. Frontends import these via the Tailwind
 * preset (`./tailwind-preset`) or directly for inline styles.
 */

export const brandColors = {
  primary: "#050f68",
  accent: "#820933",
  white: "#ffffff",
  black: "#0b0a07",
  paper: "#fafaf7",
  line: "#e8e6df",
  muted: "#6b6b66",
  soft: "#f1efe8",
  accentPink: "#ff7a9c",
} as const;

export type BrandColor = keyof typeof brandColors;

export const brandFonts = {
  display: "var(--font-fraunces)",
  body: "var(--font-geist)",
} as const;

/** Tokens exported as CSS custom properties. Use as a Tailwind theme. */
export const brandTokens = {
  colors: brandColors,
  fonts: brandFonts,
} as const;

export default brandTokens;

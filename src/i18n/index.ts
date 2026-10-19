/**
 * No-React i18n entry: just the translations data and Language type.
 *
 * Use this from Astro frontmatter, build-time scripts, or any context
 * where you don't want React. For the React provider/hook, import from
 * `@tracht-digital-solutions/tds-shared/i18n/react` instead.
 */
export { translations } from "./translations";
export type { Language, Translations } from "./translations";

/** Open Graph locale per language (`og:locale`); English is British. */
export const OG_LOCALE = { de: "de_DE", en: "en_GB" } as const;

/**
 * The language-neutral path: `/en/x` → `/x`, `/en` → `/`. For sites that
 * mount English under `/en/` with the SAME slugs, so an hreflang pair is a
 * pure prefix operation.
 */
export function neutralPath(pathname: string): string {
  return pathname.replace(/^\/en(?=\/|$)/, "") || "/";
}

/** A path in the given language: `localizedPath("/x", "en")` → `/en/x`; the root is `/en/`. */
export function localizedPath(pathname: string, lang: "de" | "en"): string {
  const neutral = neutralPath(pathname);
  if (lang === "de") return neutral;
  return neutral === "/" ? "/en/" : `/en${neutral}`;
}

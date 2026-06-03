/**
 * Shared build config for the TDS Astro frontends.
 *
 * Centralises the one build setting every site MUST share: `cssTarget`.
 * The shared `.brand-header` (styles/app.css) and the landingpage header
 * author `backdrop-filter` unprefixed; the consuming sites minify with
 * lightningcss, which only adds the `-webkit-` prefix when it sees a
 * Safari build target. The minify step reads that target from
 * `vite.build.cssTarget` (it ignores `css.lightningcss.targets`).
 *
 * Without this pin lightningcss ships the property unprefixed-only and
 * the frosted-header blur silently dies in Safari <=17 — no error, no
 * test. Importing this constant instead of hand-copying the array means
 * a new frontend can't forget it, and the browser floor moves in one
 * place. See styles/app.css and tds-shared#10.
 */

/**
 * lightningcss prefixing targets for the CSS minify step. Includes a
 * Safari target (keeps `-webkit-backdrop-filter`) and a modern Firefox
 * (keeps the standard property). Pass to `vite.build.cssTarget`.
 */
export const cssTarget: string[] = ["chrome90", "edge90", "firefox103", "safari15"];

/**
 * Drop-in `vite.build` fragment for a TDS Astro site:
 * `vite: { build: { ...tdsViteBuild } }`.
 */
export const tdsViteBuild = {
  cssMinify: "lightningcss" as const,
  cssTarget,
};

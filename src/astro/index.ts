/**
 * Shared build + `<head>` helpers for the TDS Astro frontends.
 *
 * Two things live here: the `cssTarget` build pin (below) and the no-flash
 * theme bootstrap (`themeBootstrapScript`) that every site must run inline
 * in `<head>`.
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

import { THEME_ATTRIBUTE, THEME_STORAGE_KEY } from "../design/index.js";

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

/**
 * The no-flash theme bootstrap, as a raw JS source string.
 *
 * Must run **synchronously in `<head>`**, before the body parses, so the
 * right `data-theme` is on `<html>` by the time CSS resolves. A stored
 * choice wins over the OS preference; with neither, follow the OS.
 *
 * Consume it as an inline script with `set:html` — NOT as a template body:
 *
 * ```astro
 * import { themeBootstrapScript } from "@tracht-digital-solutions/tds-shared/astro";
 * <script is:inline set:html={themeBootstrapScript} />
 * ```
 *
 * **Why `set:html` and not `<script is:inline>{themeBootstrapScript}</script>`:**
 * an Astro inline script body is raw text, so an interpolation there leaks
 * the literal braces into `dist/` and the script never parses (the same trap
 * that CLAUDE.md documents for `` {`…`} `` bodies). `set:html` is an
 * attribute expression, which Astro writes out unescaped — verified in
 * `dist/` (the `"tds-theme"` quotes must stay `"`, not `&quot;`).
 *
 * Keep `is:inline`: without it Astro would hoist/bundle this into a deferred
 * module and the theme would apply *after* first paint, which is the exact
 * flash this exists to prevent.
 *
 * Built from `THEME_STORAGE_KEY`/`THEME_ATTRIBUTE` so it cannot drift from
 * `ThemeToggle` (which writes the key) or `base.css` (which selects on the
 * attribute).
 */
export const themeBootstrapScript: string = `(function () {
  try {
    var saved = localStorage.getItem("${THEME_STORAGE_KEY}");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("${THEME_ATTRIBUTE}", saved);
      return;
    }
  } catch (e) { /* storage disabled — fall through to OS */ }
  var dark = window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute("${THEME_ATTRIBUTE}", dark ? "dark" : "light");
})();`;

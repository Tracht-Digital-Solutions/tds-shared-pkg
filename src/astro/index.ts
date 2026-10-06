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
import { PREFS_COOKIE } from "../prefs/cookie.js";

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
 * The packages behind `motion`, for an SSR site's `vite.ssr.noExternal`:
 * `noExternal: [/^@tracht-digital-solutions\//, "zod", ...motionSsrNoExternal]`.
 *
 * `./components` (ToastHost, FormAlert) and `./motion/react` import `motion`,
 * which is a DEPENDENCY of this package — so it is in the tree, but Vite
 * leaves any node_modules package external in the server bundle by default.
 * The host runs the release tree without an install, and `pack-release`
 * refuses to ship a server bundle whose `import "motion"` would not resolve
 * there. Bundling it (rather than listing it in
 * `tds.release.runtimeDependencies`) also keeps the server on exactly the
 * copy the browser bundle got.
 *
 * `motion` re-exports `framer-motion`, which splits into `motion-dom` and
 * `motion-utils` — all four must be named, or the chain stops at the first
 * one left out. Kept here so a Motion upgrade that reshuffles its packages is
 * fixed once, not in every astro.config.
 */
export const motionSsrNoExternal: string[] = [
  "motion",
  "framer-motion",
  "motion-dom",
  "motion-utils",
];

/**
 * The cross-page transition opt-in, as a raw CSS string for the FIRST element
 * of a public site's `<head>`:
 *
 * ```astro
 * import { pageTransitionOptIn } from "@tracht-digital-solutions/tds-shared/astro";
 * <head>
 *   <style is:inline set:html={pageTransitionOptIn} />
 *   …
 * ```
 *
 * `styles/page-transitions.css` carries the same `@view-transition` rule, but
 * inside the site's stylesheet, whose `<link>` sits at the END of the head —
 * after the theme bootstrap, JSON-LD and meta. Chrome decides the incoming
 * page's opt-in at its first rendering opportunity, and the parser can yield
 * before it reaches that link: on a larger page the rule arrives too late and
 * the transition is aborted ("ViewTransition opt-in disabled"). Measured on the
 * shop: 0 of 12 navigations transitioned with the rule in the stylesheet only,
 * 12 of 12 with this inline copy first in `<head>`. The animation rules stay in
 * the stylesheet; only the switch has to be early.
 *
 * `set:html`, not a template body, for the same reason as
 * `themeBootstrapScript` below.
 */
export const pageTransitionOptIn: string =
  "@view-transition{navigation:auto;types:page}" +
  "@media (prefers-reduced-motion:reduce){@view-transition{navigation:none}}";

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
 *
 * **It also re-applies on `astro:before-swap`, and that is not optional on a
 * site using `ClientRouter`.** Astro's swap clears *every* attribute from
 * `<html>` and copies the incoming document's back, so a `data-theme` this
 * script put there at load time is simply gone after the first client-side
 * navigation — the server-rendered document never carried it. The panel would
 * flip to light on the first click, and back to dark on the next full reload.
 * Writing the attribute onto `event.newDocument` *before* the swap means the
 * copy brings it along, so there is no frame in between. On the sites without
 * a router the listener never fires and this costs nothing.
 */
export const themeBootstrapScript: string = `(function () {
  /* The cross-site preference cookie (tds-shared/prefs), parsed once and
     published as window.__tdsPrefs for the other pre-paint scripts of a site
     (reader zoom, sidebar state) — so none of them re-implements the parse. */
  var prefs = {};
  try {
    var m = document.cookie.match(/(?:^|;\\s*)${PREFS_COOKIE}=([^;]*)/);
    if (m) prefs = JSON.parse(decodeURIComponent(m[1])) || {};
  } catch (e) { prefs = {}; }
  window.__tdsPrefs = prefs;
  function apply(root) {
    try {
      var saved = localStorage.getItem("${THEME_STORAGE_KEY}");
      if (saved === "light" || saved === "dark") {
        root.setAttribute("${THEME_ATTRIBUTE}", saved);
        return;
      }
    } catch (e) { /* storage disabled — fall through to the cookie / OS */ }
    if (prefs.theme === "light" || prefs.theme === "dark") {
      root.setAttribute("${THEME_ATTRIBUTE}", prefs.theme);
      return;
    }
    var dark = window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("${THEME_ATTRIBUTE}", dark ? "dark" : "light");
  }
  apply(document.documentElement);
  document.addEventListener("astro:before-swap", function (event) {
    apply(event.newDocument.documentElement);
  });
})();`;

/**
 * Tags each cross-document view transition `forward` or `back`, so the app
 * shell (`styles/app-shell.css`) can slide pages on a phone the way native
 * apps push and pop screens. Desktop keeps the plain cross-fade.
 *
 * Inline in `<head>` with `set:html`, right after {@link pageTransitionOptIn}:
 * `pagereveal` fires before the first frame of the incoming page, so a
 * bundled (deferred) script would miss it. Where the Navigation API or
 * `pagereveal` is missing it does nothing and the fade applies.
 */
export const pageDirectionScript: string = `(function () {
  window.addEventListener("pagereveal", function (e) {
    try {
      if (!e.viewTransition || !window.navigation || !navigation.activation) return;
      var a = navigation.activation;
      var back = a.navigationType === "traverse" && a.from && a.entry && a.entry.index < a.from.index;
      /* A tab or the language switch said which way (tds-shared/app
         setNavDirection); one hop, at most 4 s old. */
      try {
        var hint = JSON.parse(sessionStorage.getItem("tds-nav-dir") || "null");
        sessionStorage.removeItem("tds-nav-dir");
        if (hint && Date.now() - hint.t < 4000 && a.navigationType !== "traverse") back = hint.d === "back";
      } catch (err) {}
      e.viewTransition.types.add(back ? "back" : "forward");
    } catch (err) { /* older engine — the fade applies */ }
  });
})();`;

/**
 * Speculation rules for near-instant navigation between pages of one site:
 * a same-origin link is PRERENDERED once the visitor shows intent (hover or
 * the start of a tap — `eagerness: "moderate"`), so the tap lands on a page
 * that is already rendered. Chromium only; elsewhere the script tag is inert.
 *
 * `excludePrefixes` are never prerendered: anything that writes state or must
 * not be fetched speculatively (the control plane, install, cart, checkout,
 * account). Consume as `<script type="speculationrules" set:html={...} />`.
 */
export function speculationRules(excludePrefixes: readonly string[] = []): string {
  const never = ["/tds/", "/install", "/api/", ...excludePrefixes];
  return JSON.stringify({
    prerender: [
      {
        where: {
          and: [
            { href_matches: "/*" },
            ...never.map((p) => ({ not: { href_matches: `${p.replace(/\/$/, "")}*` } })),
            { not: { selector_matches: "[rel~=nofollow], [target=_blank], [download], [data-no-prerender]" } },
          ],
        },
        eagerness: "moderate",
      },
    ],
  });
}

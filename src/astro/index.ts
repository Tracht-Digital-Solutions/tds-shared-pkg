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
import { BOUNCE_KEYFRAMES, BOUNCE_OPTIONS } from "../motion/bounce.js";

/**
 * lightningcss prefixing targets for the CSS minify step. Includes a
 * Safari target (keeps `-webkit-backdrop-filter`) and a modern Firefox
 * (keeps the standard property). Pass to `vite.build.cssTarget`.
 */
export const cssTarget: string[] = ["chrome90", "edge90", "firefox103", "safari15"];

/**
 * Never inline a font file as a `data:` URI (0.55.1). Vite inlines assets
 * under 4 KB, and Fontsource lists a small `.woff` beside each `.woff2`: the
 * two Lato latin-ext fallbacks landed in the landing page's inlined CSS as
 * ~10 KB of base64 on EVERY page, for a format no current browser picks.
 * Other assets keep Vite's default (`undefined`).
 */
export function tdsAssetsInlineLimit(filePath: string): boolean | undefined {
  return /\.(woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined;
}

/**
 * Drop-in `vite.build` fragment for a TDS Astro site:
 * `vite: { build: { ...tdsViteBuild } }`.
 */
export const tdsViteBuild = {
  cssMinify: "lightningcss" as const,
  cssTarget,
  assetsInlineLimit: tdsAssetsInlineLimit,
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

/**
 * The error bounce, installed on every page: when something goes wrong, the
 * thing that went wrong shakes once from side to side (see `bounce` in
 * `./motion`).
 *
 * Inline in `<head>` with `set:html`, next to {@link themeBootstrapScript}, so
 * it is listening before the first island hydrates. It reacts to what the page
 * already does when it fails — nothing has to opt in:
 *
 * - a field the browser refuses on submit (`invalid` event), and a field whose
 *   `aria-invalid` turns `"true"`;
 * - an error appearing or changing: `[role="alert"]`, `.form-alert`,
 *   `.tds-toast--error`, `.tds-alert--danger`, `[data-error]` — the shared
 *   feedback primitives and every hand-rolled alert;
 * - and the button that caused it: the last button pressed (or the form's
 *   submitter), if the error follows within four seconds.
 *
 * Markup that is PARSED is not an error appearing: mutations are ignored until
 * `DOMContentLoaded`, and again across an Astro client-side swap, so a page
 * that arrives with a message in it does not shake on load. Nodes inside
 * `[inert]` or the theme preview clone never shake. A no-op under
 * `prefers-reduced-motion: reduce`. `[data-bounce="off"]` opts an alert out.
 *
 * An error that does not change the markup (the same message twice) is
 * invisible to this watcher — call `bounce(el)` from `./motion` there.
 */
export const errorBounceScript: string = `(function () {
  if (window.__tdsBounce) return;
  var KF = ${JSON.stringify(BOUNCE_KEYFRAMES)};
  var OPT = ${JSON.stringify(BOUNCE_OPTIONS)};
  var ERR = '[role="alert"], .form-alert, .tds-toast--error, .tds-alert--danger, [data-error]';
  function still() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function bounce(el) {
    if (!el || !el.animate || still()) return;
    if (el.closest && el.closest("[inert], .tds-theme-preview")) return;
    var running = el.getAnimations ? el.getAnimations() : [];
    for (var i = 0; i < running.length; i++) if (running[i].id === "tds-bounce") running[i].cancel();
    try { el.animate(KF, OPT).id = "tds-bounce"; } catch (e) { /* no Web Animations */ }
  }
  window.__tdsBounce = bounce;

  var last = null, lastAt = 0;
  function remember(el) { if (el) { last = el; lastAt = Date.now(); } }
  function blame() {
    if (last && last.isConnected && Date.now() - lastAt < 4000) bounce(last);
    last = null;
  }
  document.addEventListener("submit", function (e) { remember(e.submitter); }, true);
  document.addEventListener("click", function (e) {
    var t = e.target;
    remember(t && t.closest ? t.closest('button, [role="button"], input[type="submit"], input[type="button"]') : null);
  }, true);
  document.addEventListener("invalid", function (e) { bounce(e.target); blame(); }, true);

  var live = document.readyState !== "loading";
  if (!live) document.addEventListener("DOMContentLoaded", function () { live = true; });
  document.addEventListener("astro:before-swap", function () { live = false; });
  document.addEventListener("astro:after-swap", function () {
    requestAnimationFrame(function () { live = true; });
  });

  function errorIn(node) {
    if (node.nodeType !== 1) return null;
    if (node.matches(ERR)) return node;
    return node.firstElementChild ? node.querySelector(ERR) : null;
  }
  new MutationObserver(function (records) {
    if (!live) return;
    var hits = [];
    function add(el) {
      if (!el || el.getAttribute("data-bounce") === "off" || hits.indexOf(el) >= 0) return;
      if (!(el.textContent || "").trim() && !el.matches("[aria-invalid]")) return;
      hits.push(el);
    }
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === "attributes") {
        if (r.target.getAttribute("aria-invalid") === "true" && r.oldValue !== "true") add(r.target);
        continue;
      }
      var found = false;
      for (var j = 0; j < r.addedNodes.length; j++) {
        var n = r.addedNodes[j];
        var err = errorIn(n);
        if (err) { add(err); found = true; }
        if (n.nodeType === 1 && n.matches('[aria-invalid="true"]')) { add(n); found = true; }
      }
      if (!found) {
        var host = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        var owner = host && host.closest ? host.closest(ERR) : null;
        if (owner && (r.type === "characterData" || r.addedNodes.length)) add(owner);
      }
    }
    if (!hits.length) return;
    for (var k = 0; k < hits.length; k++) {
      var nested = false;
      for (var m = 0; m < hits.length; m++) if (m !== k && hits[m].contains(hits[k])) nested = true;
      if (!nested) bounce(hits[k]);
    }
    blame();
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-invalid"],
    attributeOldValue: true,
  });
})();`;

/**
 * Endless animations rest while they are off screen (0.54).
 *
 * A spinner in a closed section, a pulsing dot in the footer, a drifting
 * decoration under the hero: an animation with `iterations: Infinity` keeps
 * the compositor (and for some properties the main thread) busy every frame
 * whether anyone can see it or not. This watcher finds them and stops them
 * while they are outside the viewport.
 *
 * - **Found, not declared.** `document.getAnimations()` lists every running
 *   animation; the ones with infinite iterations are watched by ONE
 *   IntersectionObserver (128 px margin, so they are running again before they
 *   come into view). CSS animations announce themselves with `animationstart`;
 *   Web Animations (`el.animate`, Motion's hardware-accelerated tweens) are
 *   found by a rescan after load, after DOM changes (debounced) and after an
 *   Astro page swap.
 * - **CSS animations** are paused by the `[data-tds-offscreen]` rule in
 *   `styles/base.css`, so one that STARTS while its element is off screen is
 *   paused from its first frame. **Web Animations** are paused with `pause()`
 *   and resumed with `play()` — only those this script paused, never one a
 *   component paused itself.
 * - Not reached: animation loops written as JavaScript (`requestAnimationFrame`
 *   or Motion's own frame loop for springs and independent transforms). Those
 *   gate themselves with an IntersectionObserver where they live.
 *
 * Inline next to the theme bootstrap in every layout:
 * `<script is:inline set:html={offscreenAnimationScript} />`. Installs once;
 * a no-op without IntersectionObserver or Web Animations.
 */
export const offscreenAnimationScript: string = `(function () {
  if (window.__tdsOffscreen || !window.IntersectionObserver || !document.getAnimations) return;
  window.__tdsOffscreen = true;
  var ATTR = "data-tds-offscreen";
  var watched = new WeakSet();
  var ours = new WeakSet();
  function endless(a) {
    var t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
    return !!t && t.iterations === Infinity;
  }
  function isCss(a) { return typeof a.animationName === "string"; }
  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var el = entries[i].target, off = !entries[i].isIntersecting;
      if (off) el.setAttribute(ATTR, ""); else el.removeAttribute(ATTR);
      var list = el.getAnimations ? el.getAnimations() : [];
      for (var j = 0; j < list.length; j++) {
        var a = list[j];
        if (isCss(a) || !endless(a)) continue;
        if (off && a.playState === "running") { a.pause(); ours.add(a); }
        else if (!off && ours.has(a)) { ours.delete(a); a.play(); }
      }
    }
  }, { rootMargin: "128px" });
  function watch(el) {
    if (!el || el.nodeType !== 1 || watched.has(el)) return;
    watched.add(el);
    io.observe(el);
  }
  function scan() {
    var all = document.getAnimations();
    for (var i = 0; i < all.length; i++) {
      var a = all[i];
      var el = a.effect && a.effect.target;
      if (!el || !endless(a)) continue;
      watch(el);
      if (!isCss(a) && a.playState === "running" && el.hasAttribute(ATTR)) { a.pause(); ours.add(a); }
    }
  }
  document.addEventListener("animationstart", function (e) {
    var el = e.target;
    if (!el || !el.getAnimations) return;
    var list = el.getAnimations();
    for (var i = 0; i < list.length; i++) if (endless(list[i])) { watch(el); return; }
  }, true);
  var timer = 0;
  function later(ms) {
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (window.requestIdleCallback) requestIdleCallback(scan, { timeout: 1000 }); else scan();
    }, ms);
  }
  new MutationObserver(function () { later(400); }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "complete") later(0); else window.addEventListener("load", function () { later(0); setTimeout(scan, 3000); });
  document.addEventListener("astro:page-load", function () { later(200); });
})();`;

/**
 * A tip on a control the mouse rests on (0.58).
 *
 * Resting on a button for a moment (700 ms) shows one small navy label above
 * it, the way a desktop app does; moving on to the next control within 400 ms
 * shows its tip at once. Mouse only: touch has no hover, and a tip that
 * appears on a tap covers what the tap was for.
 *
 * What the tip says, first match wins:
 * 1. `data-tip` — the author's words. `data-tip=""` switches it off for one
 *    element, `data-no-tip` on an ancestor for a whole region.
 * 2. `title` — moved into `data-tip` on first hover so the browser's own
 *    tooltip does not appear on top (an icon-only control keeps the text as
 *    its `aria-label`, so its accessible name survives).
 * 3. `aria-label`, when it says more than the visible text (icon buttons).
 * 4. For links: where they lead when that is not obvious — another site, a
 *    new tab, a mail address, a phone number, a download.
 * 5. `<summary>`: open or close.
 * A control whose visible text already says everything gets no tip; reading
 * a label back is noise.
 *
 * The tip is `aria-hidden`: everything it says is already the control's name
 * or visible text, so a screen reader would hear it twice. One element, shown
 * as a manual popover so it sits above an open `<dialog>`.
 *
 * Inline next to the other bootstrap scripts in every public layout:
 * `<script is:inline set:html={hoverTipScript} />`. Styles: `.tds-hover-tip`
 * in `styles/base.css`.
 */
export const hoverTipScript: string = `(function () {
  if (window.__tdsHoverTip || !window.matchMedia) return;
  window.__tdsHoverTip = true;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  var DELAY = 700, WARM = 400, GAP = 8;
  var SEL = "button, [role=button], [role=tab], summary, input[type=submit], input[type=button], input[type=reset], [data-tip], .btn, a[class*=btn], a[class*=button], a[class*=cta], a[class*=action], a[aria-label]";
  var tip = null, current = null, timer = 0, warmUntil = 0;
  function de() { return (document.documentElement.lang || "de").toLowerCase().indexOf("en") !== 0; }
  function norm(s) { return (s || "").toLowerCase().split(/[^a-z0-9äöüß]+/).join(" ").trim(); }
  function linkHint(a) {
    var href = a.getAttribute("href") || "";
    if (!href || href.charAt(0) === "#") return "";
    if (href.indexOf("mailto:") === 0) return (de() ? "E-Mail an " : "Email ") + decodeURIComponent(href.slice(7).split("?")[0]);
    if (href.indexOf("tel:") === 0) return (de() ? "Anrufen: " : "Call ") + decodeURIComponent(href.slice(4));
    if (a.hasAttribute("download")) return de() ? "Datei herunterladen" : "Download the file";
    var url;
    try { url = new URL(href, location.href); } catch (e) { return ""; }
    var tab = a.getAttribute("target") === "_blank";
    if (url.host && url.host !== location.host) {
      return (de() ? "Öffnet " : "Opens ") + url.host.replace(/^www[.]/, "") + (tab ? (de() ? " in einem neuen Tab" : " in a new tab") : "");
    }
    return tab ? (de() ? "Öffnet in einem neuen Tab" : "Opens in a new tab") : "";
  }
  function textFor(el) {
    var own = el.getAttribute("data-tip");
    if (own !== null) return own.trim();
    var visible = norm(el.textContent);
    var title = el.getAttribute("title");
    if (title) {
      if (!el.getAttribute("aria-label") && !visible) el.setAttribute("aria-label", title);
      el.setAttribute("data-tip", norm(title) === visible ? "" : title);
      el.removeAttribute("title");
      return norm(title) === visible ? "" : title.trim();
    }
    var label = el.getAttribute("aria-label");
    if (label && norm(label) !== visible) return label.trim();
    if (el.tagName === "A") return linkHint(el);
    if (el.tagName === "SUMMARY" && el.parentElement && el.parentElement.tagName === "DETAILS") {
      if (el.parentElement.open) return de() ? "Zuklappen" : "Collapse";
      return de() ? "Aufklappen" : "Expand";
    }
    return "";
  }
  function ensure() {
    if (tip && tip.isConnected) return tip;
    tip = document.createElement("div");
    tip.className = "tds-hover-tip";
    tip.setAttribute("aria-hidden", "true");
    if (tip.showPopover) tip.setAttribute("popover", "manual");
    document.body.appendChild(tip);
    return tip;
  }
  function place(el) {
    var r = el.getBoundingClientRect();
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
    var top = r.top - h - GAP, side = "top";
    if (top < GAP) { top = r.bottom + GAP; side = "bottom"; }
    var left = Math.max(GAP, Math.min(r.left + r.width / 2 - w / 2, vw - w - GAP));
    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(Math.max(GAP, Math.min(top, vh - h - GAP))) + "px";
    tip.setAttribute("data-side", side);
  }
  function show(el, text) {
    ensure();
    tip.textContent = text;
    if (tip.showPopover) {
      try { if (tip.matches(":popover-open")) tip.hidePopover(); tip.showPopover(); } catch (e) {}
    }
    tip.setAttribute("data-open", "");
    place(el);
  }
  function hide() {
    clearTimeout(timer);
    if (tip && tip.hasAttribute("data-open")) {
      warmUntil = Date.now() + WARM;
      tip.removeAttribute("data-open");
      if (tip.hidePopover) { try { tip.hidePopover(); } catch (e) {} }
    }
    current = null;
  }
  function dismiss() {
    if (!current && !(tip && tip.hasAttribute("data-open"))) return;
    hide();
    warmUntil = 0;
  }
  document.addEventListener("pointerover", function (e) {
    if (e.pointerType !== "mouse" || !fine.matches) return;
    var t = e.target;
    var el = t && t.closest ? t.closest(SEL) : null;
    if (el && el === current) return;
    hide();
    if (!el || el.closest("[data-no-tip]") || el.hasAttribute("disabled")) return;
    var text = textFor(el);
    if (!text) return;
    current = el;
    timer = setTimeout(function () {
      if (current === el && el.isConnected) show(el, text);
    }, Date.now() < warmUntil ? 0 : DELAY);
  }, true);
  document.addEventListener("pointerout", function (e) {
    if (!current) return;
    var to = e.relatedTarget;
    if (!to || !current.contains(to)) hide();
  }, true);
  ["pointerdown", "keydown", "wheel", "scroll"].forEach(function (type) {
    window.addEventListener(type, dismiss, { capture: true, passive: true });
  });
  document.addEventListener("astro:before-swap", dismiss);
})();`;

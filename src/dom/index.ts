/**
 * Plain-DOM twins of the two islands every public page shows (0.60).
 *
 * The theme toggle and the "Cookie-Einstellungen" link were React islands, and
 * a React island costs a page the whole React runtime (~200 KB unminified) —
 * on the blog's article pages for nothing else (tds-blog-frontend#27). Both
 * are a button and one click handler, so here they are without a framework:
 *
 *   ---
 *   import { themeToggleMarkup } from "@tracht-digital-solutions/tds-shared/dom";
 *   ---
 *   <Fragment set:html={themeToggleMarkup({ labelToDark, labelToLight })} />
 *   <script>
 *     import { mountThemeToggles } from "@tracht-digital-solutions/tds-shared/dom";
 *     mountThemeToggles();
 *   </script>
 *
 * The markup functions run on the server, the mount functions in the browser;
 * neither has a side effect at import. Mounting twice is a no-op per button,
 * so a page with two toggles (the blog's header and sidebar) can call it from
 * both places.
 *
 * The toggle's behaviour is `attachThemeToggle`, the same code the React
 * `ThemeToggle` runs, so the two cannot drift.
 */

import { translations, type Language } from "../i18n/translations";
import { onThemeChange } from "../theme/index.js";
import { attachThemeToggle, currentTheme, MOON_PATH, SUN_RAYS } from "../theme/toggle.js";
import { openConsentSettings } from "../consent/store.js";

const escapeAttr = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ICON_ATTRS =
  'aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';

export interface ThemeToggleMarkupOptions {
  /** aria-label / title shown in light mode (tap to go dark). */
  labelToDark?: string;
  /** aria-label / title shown in dark mode (tap to go light). */
  labelToLight?: string;
}

/**
 * The toggle button, server-rendered. Same classes and icons as the React
 * `ThemeToggle`; which icon shows is CSS keyed on `[data-theme]` (base.css),
 * so a dark-mode visitor sees the sun before any script has run.
 */
export function themeToggleMarkup({
  labelToDark = "Auf Dunkel umschalten",
  labelToLight = "Auf Hell umschalten",
}: ThemeToggleMarkupOptions = {}): string {
  const toDark = escapeAttr(labelToDark);
  const toLight = escapeAttr(labelToLight);
  const rays = SUN_RAYS.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`).join("");
  return (
    `<button type="button" data-tds-theme-toggle data-label-dark="${toDark}" data-label-light="${toLight}"` +
    ` aria-label="${toDark}" title="${toDark}"` +
    ` class="tds-theme-toggle inline-flex items-center justify-center w-9 h-9 rounded-full text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-black/5 active:bg-black/10 transition-colors cursor-pointer">` +
    `<svg ${ICON_ATTRS} class="tds-theme-toggle__moon"><path d="${MOON_PATH}"/></svg>` +
    `<svg ${ICON_ATTRS} class="tds-theme-toggle__sun"><circle cx="12" cy="12" r="4"/>${rays}</svg>` +
    `</button>`
  );
}

/**
 * Wire every server-rendered toggle under `root`. Keeps each label naming the
 * theme a click leads to, whoever changes the theme. Returns the teardown.
 */
export function mountThemeToggles(root: ParentNode = document): () => void {
  const teardowns: (() => void)[] = [];
  for (const button of root.querySelectorAll<HTMLButtonElement>("button[data-tds-theme-toggle]")) {
    if (button.dataset.tdsMounted !== undefined) continue;
    button.dataset.tdsMounted = "";
    const label = () => {
      const text = (currentTheme() === "dark" ? button.dataset.labelLight : button.dataset.labelDark) ?? "";
      button.setAttribute("aria-label", text);
      button.setAttribute("title", text);
    };
    label();
    const detachTheme = onThemeChange(label);
    const detachToggle = attachThemeToggle(button);
    teardowns.push(() => {
      detachTheme();
      detachToggle();
      delete button.dataset.tdsMounted;
    });
  }
  return () => {
    for (const teardown of teardowns) teardown();
  };
}

export interface ConsentLinkMarkupOptions {
  lang?: Language;
  /** Extra classes, so a footer can match it to its own link styling. */
  className?: string;
}

/**
 * The footer's "Cookie-Einstellungen" button, server-rendered — the twin of
 * the React `ConsentLink`, and a `<button>` for the same reason: it acts on
 * this page rather than navigating anywhere (Art. 7 Abs. 3 DSGVO is why it
 * exists at all; see `ConsentLink`).
 */
export function consentLinkMarkup({ lang = "de", className }: ConsentLinkMarkupOptions = {}): string {
  const classes = className ? `consent-link ${className}` : "consent-link";
  return `<button type="button" data-tds-consent-open class="${escapeAttr(classes)}">${escapeAttr(translations[lang].consent.manage)}</button>`;
}

/**
 * Wire every server-rendered consent link under `root`. The click goes through
 * `openConsentSettings`, which a banner that is not loaded yet still receives:
 * `client:when="consent"` loads it on that event, and the banner honours the
 * request on mount.
 */
export function mountConsentLinks(root: ParentNode = document): () => void {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-tds-consent-open]")).filter(
    (button) => button.dataset.tdsMounted === undefined,
  );
  for (const button of buttons) {
    button.dataset.tdsMounted = "";
    button.addEventListener("click", openConsentSettings);
  }
  return () => {
    for (const button of buttons) {
      button.removeEventListener("click", openConsentSettings);
      delete button.dataset.tdsMounted;
    }
  };
}

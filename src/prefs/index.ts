/**
 * Visitor preferences that follow the person — across the four public
 * properties and, when signed in, across devices.
 *
 * Consumed via
 * `import { writePrefs, startAccountPrefsSync } from "@tracht-digital-solutions/tds-shared/prefs"`.
 *
 * ### Three stores, one record
 *
 * 1. The `tds_prefs` cookie on `.tracht-digital.de` (`./cookie`). Read
 *    synchronously in `<head>` by `themeBootstrapScript`, which publishes it as
 *    `window.__tdsPrefs` for a site's other pre-paint scripts.
 * 2. `localStorage["tds-theme"]` stays the theme's per-origin cache — written by
 *    `applyThemePreference`, which also writes the cookie.
 * 3. `/me/preferences` on the frontend API for a signed-in visitor — the copy
 *    that reaches another device. Same endpoint and whitelist the panels use.
 *
 * Everything is best-effort and silent: a preference is decoration, and on a
 * public page a failed save is not worth a toast.
 */
import { applyThemePreference } from "../theme/index.js";
import { THEME_CHANGE_EVENT, type ThemeChangeDetail } from "../design/index.js";
import { accountEndpoints, fetchAccount, mayHaveSession, type AccountEndpointFallbacks } from "../components/accountAuth.js";
import { runtimeSetting, DEFAULT_API_BASE } from "../api/index.js";
import {
  PREFS_CHANGE_EVENT,
  readPrefsCookie,
  sanitizePrefs,
  writePrefsCookie,
  type PrefKey,
  type Prefs,
} from "./cookie.js";

export {
  PREFS_COOKIE,
  PREFS_CHANGE_EVENT,
  PREF_VALUES,
  parsePrefsCookie,
  prefsCookieDomain,
  sanitizePrefs,
} from "./cookie.js";
export type { PrefKey, Prefs } from "./cookie.js";

/** The visitor's current preferences (empty during SSR). */
export function readPrefs(): Prefs {
  return readPrefsCookie();
}

/**
 * Save preferences for this visitor. Writes the cross-site cookie and
 * announces the change, which the account sync (if started) pushes to the
 * server. The theme goes through `applyThemePreference` instead — it also has
 * to paint.
 */
export function writePrefs(partial: Partial<Record<PrefKey, string | undefined>>): Prefs {
  return writePrefsCookie(partial);
}

/** Subscribe to preference changes. Returns the unsubscribe function. */
export function onPrefsChange(handler: (prefs: Prefs) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => handler(((event as CustomEvent<Prefs>).detail ?? {}) as Prefs);
  window.addEventListener(PREFS_CHANGE_EVENT, listener);
  return () => window.removeEventListener(PREFS_CHANGE_EVENT, listener);
}

let syncStarted = false;

/**
 * Reconcile with the signed-in account. Call once per page from a non-inline
 * script; a second call is a no-op.
 *
 * On load: if there is a session, `GET /me/preferences` and apply what the
 * server holds WITHOUT announcing (or it would be saved straight back). After
 * that, every local change is `PUT` as a partial write — the whitelist on the
 * server keeps only the keys it knows, so a newer site writing a newer key
 * never loses the save.
 *
 * The visible cost is one frame in the device's own theme the first time the
 * account's choice arrives on a new device; blocking first paint on a
 * cross-origin request would cost every page load instead.
 *
 * Resolves `true` when a session was found.
 */
export async function startAccountPrefsSync(fallbacks: AccountEndpointFallbacks = {}): Promise<boolean> {
  if (syncStarted || typeof window === "undefined") return false;
  syncStarted = true;
  // Anonymous on this browser: nothing to sync, and no /me probe (a 401).
  if (!mayHaveSession()) return false;

  let account: unknown = null;
  try {
    account = await fetchAccount(await accountEndpoints(fallbacks));
  } catch {
    account = null;
  }
  if (!account) return false;

  const base = (await runtimeSetting("apiBase", fallbacks.apiBase ?? DEFAULT_API_BASE)).replace(/\/+$/, "");
  const url = `${base}/me/preferences`;

  try {
    const res = await fetch(url, { credentials: "include" });
    if (res.ok) {
      const body = (await res.json()) as { preferences?: unknown };
      const server = sanitizePrefs(body.preferences);
      const { theme, ...rest } = server;
      if (theme) applyThemePreference(theme, { announce: false });
      if (Object.keys(rest).length > 0) writePrefsCookie(rest, { announce: false });
    }
  } catch {
    /* frontend API not reachable — the device copy keeps working */
  }

  const push = (preferences: Prefs) => {
    if (Object.keys(preferences).length === 0) return;
    fetch(url, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences }),
    }).catch(() => {
      /* best-effort; the cookie already holds the change */
    });
  };
  onPrefsChange((prefs) => {
    // The theme travels on its own event (below); everything else here.
    const { theme: _theme, ...rest } = prefs;
    push(rest);
  });
  window.addEventListener(THEME_CHANGE_EVENT, (event) => {
    const detail = (event as CustomEvent<ThemeChangeDetail>).detail;
    if (detail) push({ theme: detail.preference });
  });
  return true;
}

/** The registrable hosts of the four properties — an entry from one of them is not "from outside". */
const OWN_HOST = /(^|\.)tracht-digital\.de$/i;

/**
 * Remember the language a visitor picked. Call from a language switch before
 * navigating.
 */
export function rememberLocale(locale: "de" | "en"): void {
  writePrefs({ locale });
}

/**
 * Send a returning visitor to their saved language — conservatively.
 *
 * Only when:
 * - a language was saved (crawlers carry no cookie, so they always get the
 *   requested URL and the hreflang/canonical pair stays authoritative);
 * - it differs from the page's language and an alternate URL exists;
 * - the visit did not come from one of our own pages. Following a link to the
 *   other language from inside the sites is an explicit choice and must win.
 *
 * Returns `true` when it navigated. `location.replace`, so Back does not
 * bounce the visitor into a loop.
 */
export function redirectToSavedLocale(pageLang: "de" | "en", alternateUrl: string | null | undefined): boolean {
  if (typeof window === "undefined" || !alternateUrl) return false;
  const saved = readPrefs().locale;
  if (!saved || saved === pageLang) return false;
  try {
    if (document.referrer && OWN_HOST.test(new URL(document.referrer).hostname)) return false;
  } catch {
    /* unparsable referrer — treat as external */
  }
  location.replace(alternateUrl);
  return true;
}

/** Test seam: forget that the sync was started. */
export function __resetPrefsSyncForTests(): void {
  syncStarted = false;
}

/**
 * The cross-site preference cookie — the low-level half of `./prefs`.
 *
 * Split out so `theme/index.ts` can write the cookie without importing the
 * account sync in `prefs/index.ts` (which itself imports the theme runtime to
 * apply a server value). One direction of imports, no cycle.
 *
 * ### Why a cookie and not only `localStorage`
 *
 * `localStorage` is per ORIGIN. The landingpage, the blog, the tools site and
 * the shop are four origins, so a reader who picked dark mode on the blog got
 * light mode on the shop one click later. A cookie on `.tracht-digital.de` is
 * the one store all four can read synchronously — which matters, because the
 * theme must be known in `<head>` before the first paint.
 *
 * It is a preference cookie (strictly functional, stores only what the visitor
 * set themselves) and never carries anything identifying.
 */

/** Cookie holding the visitor's preferences as compact JSON. */
export const PREFS_COOKIE = "tds_prefs";

/** Fired on `window` after every {@link writePrefsCookie}. `detail` is the full new record. */
export const PREFS_CHANGE_EVENT = "tds:prefs-change";

/** One year — a preference should outlive a browser restart, not a person. */
const MAX_AGE = 60 * 60 * 24 * 365;

/** The closed set of preference keys and values. Mirrors `PreferenceWhitelist.php`. */
export const PREF_VALUES = {
  theme: ["light", "dark", "system"],
  locale: ["de", "en"],
  reader_zoom: ["0.9", "1", "1.1", "1.25", "1.4"],
  reader_sidenav: ["open", "collapsed"],
  reader_toc: ["open", "collapsed"],
} as const;

export type PrefKey = keyof typeof PREF_VALUES;
export type Prefs = { [K in PrefKey]?: (typeof PREF_VALUES)[K][number] };

/** Keep only recognised keys with recognised values. */
export function sanitizePrefs(raw: unknown): Prefs {
  if (typeof raw !== "object" || raw === null) return {};
  const out: Record<string, string> = {};
  for (const key of Object.keys(PREF_VALUES) as PrefKey[]) {
    const value = (raw as Record<string, unknown>)[key];
    const asString = typeof value === "number" ? String(value) : value;
    if (typeof asString === "string" && (PREF_VALUES[key] as readonly string[]).includes(asString)) {
      out[key] = asString;
    }
  }
  return out as Prefs;
}

/**
 * The cookie `Domain` for a hostname: the registrable `tracht-digital.de` for
 * any of its hosts, nothing (host-only) everywhere else — localhost, preview
 * hosts, tests. A `Domain` the browser does not accept would drop the write
 * silently, which is the worst failure for a preference.
 */
export function prefsCookieDomain(hostname: string): string | null {
  const host = hostname.toLowerCase();
  return host === "tracht-digital.de" || host.endsWith(".tracht-digital.de") ? ".tracht-digital.de" : null;
}

/** Parse the preference cookie out of a `document.cookie` string. */
export function parsePrefsCookie(cookieString: string): Prefs {
  const match = cookieString.match(new RegExp(`(?:^|;\\s*)${PREFS_COOKIE}=([^;]*)`));
  if (!match) return {};
  try {
    return sanitizePrefs(JSON.parse(decodeURIComponent(match[1]!)));
  } catch {
    return {};
  }
}

/** The current cookie record (empty during SSR). */
export function readPrefsCookie(): Prefs {
  if (typeof document === "undefined") return {};
  try {
    return parsePrefsCookie(document.cookie);
  } catch {
    return {};
  }
}

/**
 * Merge `partial` into the cookie and announce the result. A value of
 * `undefined` removes that key ("system" theme is stored as a real value —
 * on the server it has to be told apart from "never chose").
 */
export function writePrefsCookie(
  partial: Partial<Record<PrefKey, string | undefined>>,
  options: { announce?: boolean } = {},
): Prefs {
  const next: Record<string, string | undefined> = { ...readPrefsCookie() };
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  const clean = sanitizePrefs(next);
  if (typeof document !== "undefined") {
    try {
      const domain = prefsCookieDomain(location.hostname);
      document.cookie =
        `${PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(clean))}` +
        `; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax` +
        (domain ? `; Domain=${domain}` : "") +
        (location.protocol === "https:" ? "; Secure" : "");
    } catch {
      /* cookies disabled — the per-origin localStorage copy still applies */
    }
  }
  // `announce: false` when APPLYING a value that came from the server — the
  // account sync listens to this event and would echo it straight back.
  if (options.announce !== false && typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(PREFS_CHANGE_EVENT, { detail: clean }));
    } catch {
      /* no CustomEvent (very old engines) — nothing listens there anyway */
    }
  }
  return clean;
}

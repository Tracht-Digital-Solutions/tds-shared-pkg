/**
 * Theme runtime — reading, applying and announcing the user's theme choice.
 *
 * Consumed via
 * `import { applyThemePreference } from "@tracht-digital-solutions/tds-shared/theme"`.
 *
 * ### Why this is its own entry point
 *
 * `tds-shared/design` is documented as pure functions only, and these touch
 * `localStorage`, `document` and `window`. Same split as `./toast` and
 * `./api`: a React-free module a plain-TS caller (the frontend host's
 * preferences bootstrap) can import without pulling the React runtime into
 * its chunk, while `ThemeToggle` imports it from inside a component.
 *
 * ### The three places a theme value lives
 *
 * 1. `localStorage["tds-theme"]` — the pre-paint cache. The no-flash
 *    bootstrap (`tds-shared/astro`) reads it in `<head>` before anything
 *    renders, which is the only reason there is no flash of the wrong theme.
 * 2. `<html data-theme>` — what `base.css` actually selects on.
 * 3. The server, for a logged-in user (`/me/preferences` in the frontend
 *    host). That is the source of truth ACROSS devices; storage stays the
 *    per-device cache. Reconciling the two is the host's job, not this
 *    module's — which is why every write here also announces itself on
 *    {@link THEME_CHANGE_EVENT} instead of calling an API.
 *
 * Everything here is guarded and returns `void`/a sensible default: a theme
 * is decoration, and it must never be able to break the page it decorates.
 */
import {
  THEME_ATTRIBUTE,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type Theme,
  type ThemeChangeDetail,
  type ThemePreference,
} from "../design/index.js";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** True when there is a real DOM to talk to (not SSR / `astro build`). */
const hasDocument = (): boolean => typeof document !== "undefined";

/**
 * What the OS is currently asking for. Defaults to `"light"` where
 * `matchMedia` is unavailable — the same fallback the bootstrap uses, so the
 * two can't disagree.
 */
export function systemTheme(): Theme {
  try {
    return typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(DARK_QUERY).matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

/** Resolve a preference to the theme that should actually be painted. */
export function resolveTheme(preference: ThemePreference): Theme {
  return preference === "system" ? systemTheme() : preference;
}

/**
 * The stored preference. A missing or unrecognised value is `"system"` —
 * see {@link THEME_PREFERENCES} for why "system" is never itself stored.
 */
export function readThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Safari private mode / storage disabled — treat as "no choice made".
  }
  return "system";
}

/** What `<html data-theme>` says right now, independent of any preference. */
export function currentTheme(): Theme {
  if (!hasDocument()) return "light";
  return document.documentElement.getAttribute(THEME_ATTRIBUTE) === "dark"
    ? "dark"
    : "light";
}

/**
 * Persist a preference, paint it, and announce it.
 *
 * The single write path for the theme — `ThemeToggle` and the profile page's
 * Darstellung tab both go through here, which is what lets one listener
 * (the host's `/me/preferences` sync) hear every change without either caller
 * knowing that a server exists.
 *
 * `announce: false` suppresses the event; pass it when APPLYING a value that
 * just came back FROM the server, or the sync listener will echo it straight
 * back as a save.
 */
export function applyThemePreference(
  preference: ThemePreference,
  options: { announce?: boolean } = {},
): Theme {
  const theme = resolveTheme(preference);

  try {
    if (preference === "system") {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Storage disabled — the attribute below still applies for this page.
  }

  if (hasDocument()) {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
  }

  if (options.announce !== false && typeof window !== "undefined") {
    try {
      const detail: ThemeChangeDetail = { preference, theme };
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail }));
    } catch {
      // Exotic environment without CustomEvent — the theme still applied.
    }
  }

  return theme;
}

/** Subscribe to theme changes. Returns the unsubscribe function. */
export function onThemeChange(
  handler: (detail: ThemeChangeDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<ThemeChangeDetail>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(THEME_CHANGE_EVENT, listener);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, listener);
}

/**
 * Keep a `"system"` preference honest while the page is open.
 *
 * Without this, "System" only means "whatever the OS said at load" — switch
 * the OS to dark and the panel stays light until a reload, which reads as the
 * setting not working. Re-checks the stored preference on every OS change
 * rather than capturing it, so a user who picks an explicit theme mid-session
 * stops being overridden. Announces nothing: the preference did not change,
 * only its resolution.
 *
 * Returns the unsubscribe function; a no-op where `matchMedia` is missing.
 */
export function startSystemThemeSync(): () => void {
  try {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return () => {};
    }
    const query = window.matchMedia(DARK_QUERY);
    const listener = () => {
      if (readThemePreference() !== "system") return;
      if (hasDocument()) {
        document.documentElement.setAttribute(THEME_ATTRIBUTE, systemTheme());
      }
    };
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  } catch {
    return () => {};
  }
}

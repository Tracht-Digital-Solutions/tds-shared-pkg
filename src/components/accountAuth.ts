/**
 * The shared session, as the PUBLIC sites see it.
 *
 * `tds-auth-api` sets `tds_session` with `Domain=.tracht-digital.de`, so a
 * login at `auth.tracht-digital.de` is already valid on `blog.` and `tools.`.
 * Until the account menu existed neither site showed a trace of it: the blog
 * had no auth code at all, and the tools site knew the session only inside
 * `ToolGate`, for premium tools.
 *
 * This module is the transport half of that menu. It is deliberately NOT
 * `apiFetch`: these calls go to auth-api, which has its own (narrower) CORS
 * allow-list, and the public sites register no `onUnauthorized` handler — a 401
 * here means "not signed in", not "bounce to a login form". A visitor reading
 * an article has no session, and that is the normal case.
 *
 * ### Reads may follow `apiBase`; writes that set a cookie may NOT
 *
 * The setup wizard can install a same-origin proxy at `/api`, and
 * `install/proxy.php` deliberately does not forward `Set-Cookie` ("these sites
 * read, they never log in"). A `DELETE /logout` routed through it would answer
 * `200` and leave the session cookie untouched — a logout button that reports
 * success and logs nobody out, with nothing anywhere to say so. So
 * {@link AccountEndpoints} carries two bases: `read` follows whatever the host
 * configured, `write` is always an absolute origin.
 */

import { DEFAULT_API_BASE, runtimeSetting } from "../api/index.js";
import type { Me } from "../types/index.js";

/** auth-api behind the production gateway. Also the JWT issuer. */
export const DEFAULT_AUTH_ORIGIN = "https://api.tracht-digital.de/auth";

/** The central login site — the only login UI in the workspace. */
export const DEFAULT_LOGIN_URL = "https://auth.tracht-digital.de";

/**
 * Cosmetic "this browser has been signed in" flag.
 *
 * Never an authorisation: the httpOnly `tds_session` cookie is the only thing
 * that grants anything, and this is readable and writable by anyone. It buys
 * two things, and the second is what pays for it: the menu can reserve the
 * trigger's width before `/me` answers, and {@link tryRefreshAccount} is
 * skipped entirely for a visitor who has never signed in — so an anonymous
 * reader costs one round trip instead of three.
 *
 * The prefix is deliberately neither `tds_admin` nor `tds_customer`: those are
 * the frontend host's pre-paint gate keys, and a future reader must not think
 * this one is read by that gate. (`localStorage` is per-origin, so a collision
 * was never possible — the confusion was.)
 */
export const ACCOUNT_HINT_KEY = "tds_pub_account";

/** Where the account menu sends each kind of request. */
export interface AccountEndpoints {
  /** `<apiBase>/auth` — may be the same-origin proxy. READS only. */
  read: string;
  /** Always an absolute origin. Anything whose response sets a cookie. */
  write: string;
  /** The central login site. */
  login: string;
}

/** Build-time values, used when the host published nothing. */
export interface AccountEndpointFallbacks {
  apiBase?: string;
  authApi?: string;
  loginUrl?: string;
}

const trimEnd = (value: string): string => value.replace(/\/+$/, "");
const isAbsolute = (value: string): boolean => /^https?:\/\//i.test(value);

/**
 * Resolve the three bases against `tds-runtime.json`, falling back to the
 * values the build baked in.
 *
 * Not memoised — `runtimeConfig()` underneath already is, so every call after
 * the first awaits an already-settled promise and this stays a few string
 * operations. One seam fewer to reset in tests.
 */
export async function accountEndpoints(
  fallbacks: AccountEndpointFallbacks = {},
): Promise<AccountEndpoints> {
  const base = await runtimeSetting("apiBase", fallbacks.apiBase ?? DEFAULT_API_BASE);
  const login = await runtimeSetting("loginUrl", fallbacks.loginUrl ?? DEFAULT_LOGIN_URL);

  // `authBase` is accepted ONLY when it is absolute. In proxy mode the host
  // publishes a relative `/api/...`, and honouring it here is precisely the
  // dropped-Set-Cookie trap described at the top of this file. Rejecting it
  // needs no new runtime key and cannot be forgotten at a call site.
  const declared = await runtimeSetting("authBase", "");
  const write = isAbsolute(declared) ? declared : (fallbacks.authApi ?? DEFAULT_AUTH_ORIGIN);

  return {
    read: `${trimEnd(base)}/auth`,
    write: trimEnd(write),
    login: trimEnd(login),
  };
}

let mePromise: Promise<Me | null> | null = null;

/**
 * The current principal, or `null` when there is no session.
 *
 * Memoised per page load so several islands on one page share the probe — but
 * **a `null` result is never cached**. The same page can gain a session (a
 * refresh succeeds, another tab logs in), and a cached `null` would leave the
 * header claiming the visitor is anonymous until they navigate.
 */
export async function fetchAccount(endpoints: AccountEndpoints): Promise<Me | null> {
  if (mePromise === null) {
    mePromise = (async () => {
      try {
        const res = await fetch(`${endpoints.read}/me`, { credentials: "include" });
        if (!res.ok) return null;
        return (await res.json()) as Me;
      } catch {
        /* offline, blocked, CORS — indistinguishable from "no session" here */
        return null;
      }
    })();
    mePromise = mePromise.then((me) => {
      if (me === null) mePromise = null;
      else setAccountHint();
      return me;
    });
  }
  return mePromise;
}

/** Drop the memo — after a logout, or any write that changes the principal. */
export function invalidateAccount(): void {
  mePromise = null;
}

/**
 * Trade the remember-me cookie for a fresh session.
 *
 * The session JWT lives an hour on purpose (it is verified against the JWKS and
 * never re-read from the auth DB, so its lifetime is also its non-revocability
 * window). "30 Tage angemeldet bleiben" IS this exchange, and a surface that
 * never performs it leaves the remember-me cookie sitting unused.
 *
 * Call it ONLY when {@link hasAccountHint} is true. Firing it for every
 * anonymous visitor would put two guaranteed-failing cross-origin requests on
 * every blog page view.
 */
export async function tryRefreshAccount(endpoints: AccountEndpoints): Promise<boolean> {
  try {
    const res = await fetch(`${endpoints.write}/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return false;
    // A 200 from /refresh is not proof on its own; confirm the session is
    // really usable before telling the caller to re-probe.
    const check = await fetch(`${endpoints.write}/me`, { credentials: "include" });
    return check.ok;
  } catch {
    return false;
  }
}

/**
 * End the session.
 *
 * **`DELETE`, never `POST`** — auth-api registers `DELETE /logout`, and a POST
 * answers 405. A 405 is a *resolved* fetch, so a `catch` around it sees
 * nothing: the local state would be cleared, the redirect would happen, and the
 * `Domain=.tracht-digital.de` cookie would sign the visitor straight back in.
 * That shipped once already; it must not ship twice.
 *
 * It does not navigate. What a public page does after a logout is the caller's
 * decision — see `afterLogout` on the menu.
 */
export async function logoutAccount(endpoints: AccountEndpoints): Promise<void> {
  try {
    await fetch(`${endpoints.write}/logout`, { method: "DELETE", credentials: "include" });
  } catch {
    /* The local state must be cleared either way; a network failure here
       cannot be allowed to leave the menu showing a person who asked to go. */
  }
  invalidateAccount();
  clearAccountHint();
}

/** `localStorage` throws in Safari's private mode; a hint is never worth a crash. */
function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function hasAccountHint(): boolean {
  try {
    return storage()?.getItem(ACCOUNT_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAccountHint(): void {
  try {
    storage()?.setItem(ACCOUNT_HINT_KEY, "1");
  } catch {
    /* ignored — see storage() */
  }
}

export function clearAccountHint(): void {
  try {
    storage()?.removeItem(ACCOUNT_HINT_KEY);
  } catch {
    /* ignored — see storage() */
  }
}

/** Where the current page is, for a `?next=` round trip. */
function here(): string {
  return typeof location !== "undefined" ? location.href : "";
}

/**
 * The central login site with a `?next=` back to this page. The value is
 * validated there against a `*.tracht-digital.de` allow-list, which is what
 * keeps this from being an open redirect.
 */
export function loginHref(login: string, next: string = here()): string {
  return `${trimEnd(login)}?next=${encodeURIComponent(next)}`;
}

/** The password-change page on the same central site. */
export function passwordHref(login: string, next: string = here()): string {
  return `${trimEnd(login)}/passwort?next=${encodeURIComponent(next)}`;
}

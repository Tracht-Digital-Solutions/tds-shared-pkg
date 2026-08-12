/**
 * The panel API transport — where a frontend call to the composed backend
 * actually goes.
 *
 * Consumed via
 * `import { apiFetch } from "@tracht-digital-solutions/tds-shared/api"`.
 *
 * ### Why this module exists
 *
 * The frontend products are static sites on their own hosts
 * (`management.tracht-digital.de`, `app.tracht-digital.de`); the composed API
 * is a different origin (`api.tracht-digital.de`). Every `tds-ext-*` island
 * used to define its own one-liner
 *
 * ```ts
 * const api = (path, init) => fetch(path, { credentials: "include", ...init });
 * ```
 *
 * with a RELATIVE path, so every extension call resolved against the product's
 * own host. That failed in the worst possible way: the static host answers
 * unknown paths with `try_files … /index.html`, i.e. **HTTP 200 + HTML**, so
 * `res.ok` was `true`, `res.json()` threw, and the usual
 * `.catch(() => setRows([]))` rendered a calm, permanent empty state. No error,
 * no console warning — the contact inbox showed "Keine Anfragen." while the
 * rows sat in the database. One helper, imported everywhere, is what keeps that
 * from being re-typed per island.
 *
 * ### Where the base comes from
 *
 * A `<meta name="tds-api-base">` written by the frontend host shell, so the
 * value is decided by the PRODUCT build (which knows its own environment) and
 * read at runtime by packages that were built long before it. `import.meta.env`
 * is not a substitute: these modules are compiled into `node_modules` packages,
 * and a consumer's `PUBLIC_*` substitution is not something a published package
 * may rely on.
 */

/** The meta tag the frontend host renders into `<head>`. */
export const API_BASE_META = "tds-api-base";

/** Used when nothing else resolves — the production gateway. */
export const DEFAULT_API_BASE = "https://api.tracht-digital.de";

let cached: string | null = null;

const trimEnd = (value: string): string => value.replace(/\/+$/, "");

/**
 * The absolute origin (plus optional path prefix) every panel API call is made
 * against. Resolution order:
 *
 * 1. `<meta name="tds-api-base" content="…">` — written by the host shell.
 * 2. `import.meta.env.PUBLIC_API_BASE` — for apps that compile this from source.
 * 3. {@link DEFAULT_API_BASE}.
 *
 * Memoised only once a real document has been consulted: during SSR/`astro
 * build` there is no `<head>` to read, and caching the fallback there would
 * poison the first client call in a shared module graph.
 */
export function apiBase(): string {
  if (cached !== null) return cached;

  const env =
    typeof import.meta !== "undefined"
      ? ((import.meta as { env?: Record<string, string | undefined> }).env?.PUBLIC_API_BASE ?? "")
      : "";

  if (typeof document === "undefined") {
    // SSR / build time — resolve, but do NOT memoise.
    return trimEnd(env || DEFAULT_API_BASE);
  }

  let meta = "";
  try {
    meta = document.querySelector(`meta[name="${API_BASE_META}"]`)?.getAttribute("content") ?? "";
  } catch {
    /* exotic document (jsdom teardown, sandboxed frame) — fall through */
  }

  cached = trimEnd(meta.trim() || env || DEFAULT_API_BASE);
  return cached;
}

/**
 * Test seam. Production code never calls this; `api.test.ts` and any island
 * test that swaps the document out do, because {@link apiBase} memoises.
 */
export function resetApiBase(): void {
  cached = null;
}

/**
 * Absolutise a panel API path.
 *
 * Anything already absolute (`http://`, `https://`, `//host`) is returned
 * untouched, which makes the call site idempotent — that is what lets an
 * extension migrate by wrapping its existing path expressions without auditing
 * whether any of them were already full URLs.
 */
export function apiUrl(path: string): string {
  if (/^(https?:)?\/\//i.test(path)) return path;
  return `${apiBase()}${path.startsWith("/") ? "" : "/"}${path}`;
}

type UnauthorizedHandler = (url: string) => void | Promise<void>;

let onUnauthorized: UnauthorizedHandler | null = null;

/**
 * Register what happens on a 401 from {@link apiFetch}.
 *
 * The frontend host registers its `onUnauthorized` here at shell start-up, so
 * an extension call finally gets the same backstop the host's own calls always
 * had: a 401 is confirmed against `/me` and a `POST /refresh` is tried before
 * the session is treated as dead. Unregistered (public sites, tests) a 401 is
 * simply returned to the caller.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

/**
 * `fetch` for the composed panel API.
 *
 * Sends the shared session cookie, resolves the path against {@link apiBase},
 * and returns the ORIGINAL response — it never throws and never redirects on
 * its own, so a caller can still handle a legitimate 401/403 (RBAC) itself.
 * Same contract as the host's `frontendFetch`, deliberately: one mental model
 * for base pages and extension islands alike.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = apiUrl(path);
  const res = await fetch(url, { credentials: "include", ...init });
  if (res.status === 401 && onUnauthorized !== null) {
    try {
      await onUnauthorized(url);
    } catch {
      /* the backstop must not turn a 401 into a thrown request */
    }
  }
  return res;
}

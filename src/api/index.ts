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

/**
 * Where {@link runtimeConfig} looks. Written by `_setup/install.php` into the
 * deployed docroot, so it is always same-origin and always a plain static file.
 */
export const RUNTIME_CONFIG_PATH = "/tds-runtime.json";

/**
 * Every key a site profile may put in `tds-runtime.json`.
 *
 * The PHP profiles in `install/profiles/*.php` list a subset per site under
 * `runtime_keys`, and `src/__tests__/installer.test.ts` asserts the two sides
 * agree. That test is the only thing standing between "the installer writes
 * `contactURL`" and a contact form that silently keeps using the baked URL —
 * a typo here has no other symptom.
 */
export const RUNTIME_KEYS = [
  "apiBase",
  "authBase",
  "loginUrl",
  "contactUrl",
  "liveChatFrontend",
] as const;

export type RuntimeKey = (typeof RUNTIME_KEYS)[number];

/**
 * What the host-side setup wizard published for this site.
 *
 * Present only on a deployed host whose operator ran `/_setup/install.php`;
 * everywhere else (dev, CI, a site nobody has configured) it is simply absent
 * and every consumer keeps its build-time value.
 */
export type RuntimeConfig = {
  version: number;
  site: string;
  mode: "proxy" | "direct";
  generatedAt?: string;
} & Partial<Record<RuntimeKey, string>>;

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

let runtimePromise: Promise<RuntimeConfig | null> | null = null;
let runtimeValue: RuntimeConfig | null = null;

/**
 * The host-side runtime configuration, fetched once and memoised.
 *
 * ### Why this exists
 *
 * The public sites (`tracht-digital.de`, `blog.`, `tools.`) are static Astro
 * builds: Vite inlines every `PUBLIC_*` at build time, so a deployed `dist/`
 * cannot be re-pointed at a different API without a full CI rebuild. That makes
 * an operator on the host powerless over the one thing they most need to fix —
 * and it fails silently, because every content fetch is deliberately fail-soft.
 * `_setup/install.php` writes `tds-runtime.json` beside `index.html`; this
 * function is what makes the deployed site read it.
 *
 * ### Contract
 *
 * **A missing or broken file is not an error.** 404, invalid JSON, offline, no
 * `fetch` at all — every one of them resolves to `null`, and the caller keeps
 * the value its build baked in. A site nobody has run the installer on behaves
 * exactly as it did before this function existed; that is the property that
 * lets it ship without touching any deployment.
 *
 * Returns `null` during SSR / `astro build` without attempting a request: there
 * is no origin to resolve a relative URL against, and the build-time content
 * fetches are configured through the environment, not through the host.
 *
 * It also returns `null` without a request when the page carries a
 * {@link API_BASE_META} tag. That tag is written by the frontend host's shell,
 * so its presence means "this page is a product build that already knows its
 * API" — the admin panel and the customer portal. Without this check every
 * panel page would fire a guaranteed 404 for a file only the public sites ever
 * have, on every single navigation.
 */
export async function runtimeConfig(): Promise<RuntimeConfig | null> {
  if (runtimePromise !== null) return runtimePromise;

  if (typeof document === "undefined" || typeof fetch !== "function") {
    runtimePromise = Promise.resolve(null);
    return runtimePromise;
  }

  let declared = "";
  try {
    declared = document.querySelector(`meta[name="${API_BASE_META}"]`)?.getAttribute("content") ?? "";
  } catch {
    /* exotic document — treat as "not declared" and go look for the file */
  }
  if (declared.trim() !== "") {
    runtimePromise = Promise.resolve(null);
    return runtimePromise;
  }

  runtimePromise = (async () => {
    try {
      const res = await fetch(RUNTIME_CONFIG_PATH, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        // A hung request must not become a hung page. Everything downstream
        // waits on this promise — `apiFetch` awaits it before resolving a URL,
        // and the tools access gate awaits it before probing the session — so
        // without a deadline one stalled request for a static file leaves the
        // gate spinning forever. Timing out means "no config", which is the
        // same safe answer as a 404.
        signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(3000) : undefined,
      });
      // The static host answers unknown paths with its SPA fallback — HTTP 200
      // plus index.html — so `res.ok` alone proves nothing. The content-type
      // check is what tells a real config from the site's own homepage.
      if (!res.ok) return null;
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("json")) return null;

      const parsed: unknown = await res.json();
      if (parsed === null || typeof parsed !== "object") return null;

      const config = parsed as RuntimeConfig;
      if (typeof config.apiBase === "string" && config.apiBase !== "") {
        // Seed the memoised base so plain `apiUrl()` callers follow too.
        cached = trimEnd(config.apiBase);
      }
      runtimeValue = config;
      return config;
    } catch {
      /* offline, blocked, malformed — the baked build value stands */
      return null;
    }
  })();

  return runtimePromise;
}

/**
 * What {@link runtimeConfig} has already resolved, without waiting.
 *
 * For synchronous render paths that must not suspend. `null` means "not loaded
 * yet OR not present" — those two are deliberately indistinguishable here,
 * because the correct response to both is the same: use the build-time value.
 */
export function runtimeConfigSync(): RuntimeConfig | null {
  return runtimeValue;
}

/**
 * One configured value, or the build-time fallback.
 *
 * The shape every call site on the public sites wants:
 *
 * ```ts
 * const url = await runtimeSetting("contactUrl", CONTACT_API_URL);
 * ```
 */
export async function runtimeSetting(key: RuntimeKey, fallback: string): Promise<string> {
  const config = await runtimeConfig();
  const value = config?.[key];
  return typeof value === "string" && value !== "" ? value : fallback;
}

/** Test seam — production code never calls this. {@see resetApiBase}. */
export function resetRuntimeConfig(): void {
  runtimePromise = null;
  runtimeValue = null;
}

/**
 * Supply the runtime config directly, skipping the request.
 *
 * Two uses. In tests it keeps {@link apiFetch} down to exactly the one call the
 * assertion is about — without it every suite that inspects `mock.calls[0]`
 * would be reading the `/tds-runtime.json` probe instead of its own request.
 * And it is the seam for a host that wants to inject the config some other way
 * (an inline `<script>`, a different filename) without this module growing a
 * second discovery path.
 */
export function primeRuntimeConfig(config: RuntimeConfig | null): void {
  runtimeValue = config;
  runtimePromise = Promise.resolve(config);
  if (config !== null && typeof config.apiBase === "string" && config.apiBase !== "") {
    cached = trimEnd(config.apiBase);
  }
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

type HeadersProvider = (url: string) => Record<string, string>;

let headersProvider: HeadersProvider | null = null;

/**
 * Register headers to add to every {@link apiFetch}.
 *
 * The twin of {@link setUnauthorizedHandler}, and registered from the same
 * place: the frontend host's shell. Its first consumer is the company
 * switcher, which has to put `X-Act-As-Company` on every extension call — and
 * an extension cannot reach into the host to do that itself.
 *
 * **Generic headers, not `setActiveCompany(id)`**, deliberately. This is a
 * design/i18n/transport library; it must not learn what a company is. It also
 * solves the next "every call needs header X" the same way.
 *
 * The provider receives the resolved absolute URL, because *which* headers are
 * safe depends on where the call is going — see the note in `apiFetch`.
 * A provider must not throw; one that does is ignored for that request.
 */
export function setRequestHeadersProvider(provider: HeadersProvider | null): void {
  headersProvider = provider;
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
  // Resolve the host-side config FIRST, so a site the operator re-pointed with
  // /_setup/install.php is followed by every existing call site without one of
  // them being edited. It is a single memoised request; every call after the
  // first awaits an already-settled promise.
  await runtimeConfig();

  const url = apiUrl(path);

  // Provider headers sit UNDER the caller's, so an explicit header at the call
  // site always wins. The provider decides per URL what is safe to send: the
  // auth API's CORS allow-list is narrower than the composed API's, and a
  // header it does not allow fails the PREFLIGHT — which means the request is
  // never sent at all and the button just looks dead.
  let extra: Record<string, string> = {};
  if (headersProvider !== null) {
    try {
      extra = headersProvider(url);
    } catch {
      /* a header provider must never be able to break the request */
    }
  }

  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { ...extra, ...(init.headers as Record<string, string> | undefined) },
  });
  if (res.status === 401 && onUnauthorized !== null) {
    try {
      await onUnauthorized(url);
    } catch {
      /* the backstop must not turn a 401 into a thrown request */
    }
  }
  return res;
}

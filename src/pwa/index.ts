/**
 * Installable, offline-capable public sites — manifest and service worker.
 *
 * Consumed via `import { buildManifest, buildServiceWorker } from
 * "@tracht-digital-solutions/tds-shared/pwa"` from two PRERENDERED Astro
 * endpoints per site (`/manifest.webmanifest`, `/sw.js`). Prerendered on
 * purpose: the service worker's version must change with the BUILD, not with
 * a server restart — a restart-scoped version would re-install the worker on
 * every Passenger recycle.
 *
 * Pure functions, no DOM — safe in server code.
 *
 * ### The rule the worker is built around: never serve an old build
 *
 * Deploys on these hosts already fail quietly (a cached 200 with dead assets,
 * a release stamp that lies). A service worker that answers from cache would
 * hide a broken deploy from the one person who could notice it. So:
 *
 * - **Pages are network-first.** Online, the network always answers; the cache
 *   only stands in when the network fails, and then marks nothing as fresh.
 * - **Only fingerprinted assets are cache-first** (`/_astro/`): their URL
 *   changes with their content, so a cached copy can never be stale.
 * - **Never cached:** non-GET, other origins, anything under the exclusion
 *   prefixes (control plane, install, account, cart, checkout…), and any
 *   response that is not a plain 200 or that says `no-store`/`private`.
 * - The worker takes over immediately (`skipWaiting` + `clients.claim`). That
 *   is safe precisely because of the two rules above: there is no stale shell
 *   it could keep alive.
 */

export interface ManifestOptions {
  name: string;
  shortName: string;
  description: string;
  lang: "de" | "en";
  /** Where the installed app opens. Default `/`. */
  startUrl?: string;
  themeColor: string;
  backgroundColor: string;
  /** PNG icons; at least 192 and 512. A `maskable` one is strongly advised. */
  icons: Array<{ src: string; sizes: string; type?: string; purpose?: "any" | "maskable" | "any maskable" }>;
  shortcuts?: Array<{ name: string; url: string; description?: string }>;
  categories?: string[];
}

/** The web app manifest as a JSON-ready object. */
export function buildManifest(o: ManifestOptions): Record<string, unknown> {
  return {
    name: o.name,
    short_name: o.shortName,
    description: o.description,
    lang: o.lang,
    dir: "ltr",
    start_url: o.startUrl ?? "/",
    scope: "/",
    id: o.startUrl ?? "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    theme_color: o.themeColor,
    background_color: o.backgroundColor,
    icons: o.icons.map((i) => ({ type: "image/png", ...i })),
    ...(o.shortcuts?.length ? { shortcuts: o.shortcuts } : {}),
    ...(o.categories?.length ? { categories: o.categories } : {}),
  };
}

/** Path prefixes no site's worker may ever cache. Sites add their own. */
export const SW_ALWAYS_EXCLUDED: readonly string[] = [
  "/tds/",
  "/install",
  "/api/",
  "/auth",
  "/konto",
  "/account",
  "/profil",
  "/sw.js",
];

export interface ServiceWorkerOptions {
  /** Changes per build — e.g. a build timestamp. */
  version: string;
  /** Offline fallback page per language prefix: `{ "/": "/offline", "/en/": "/en/offline" }`. */
  offlinePages: Record<string, string>;
  /** Extra never-cache prefixes (cart, checkout, premium…). */
  exclude?: string[];
  /** How many pages to keep for offline reading (oldest evicted). Default 30. */
  maxPages?: number;
  /** Cap for cached fingerprinted assets. Default 120. */
  maxAssets?: number;
  /** Only pages under these prefixes are kept for offline use. Default: every page. */
  offlinePrefixes?: string[];
}

/** Cache names. Exported so an offline page can read the same caches. */
export const SW_PAGE_CACHE = "tds-pages";
export const SW_ASSET_CACHE = "tds-assets";

/**
 * The service worker source. Serve it as `application/javascript` with
 * `Cache-Control: no-cache` at the site root (`/sw.js`) so its scope is `/`.
 */
export function buildServiceWorker(o: ServiceWorkerOptions): string {
  const config = {
    version: o.version,
    offline: o.offlinePages,
    exclude: [...SW_ALWAYS_EXCLUDED, ...(o.exclude ?? [])],
    maxPages: o.maxPages ?? 30,
    maxAssets: o.maxAssets ?? 120,
    keep: o.offlinePrefixes ?? null,
    pages: SW_PAGE_CACHE,
    assets: SW_ASSET_CACHE,
  };
  return `/* tds-shared service worker — generated, do not edit. */
"use strict";
const C = ${JSON.stringify(config)};
const SHELL = "tds-shell-" + C.version;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(Object.values(C.offline)))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("tds-shell-") && n !== SHELL).map((n) => caches.delete(n)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

function excluded(url) {
  return C.exclude.some((p) => url.pathname === p.replace(/\\/$/, "") || url.pathname.startsWith(p));
}

function cacheable(response) {
  if (!response || response.status !== 200 || response.type !== "basic") return false;
  const cc = (response.headers.get("Cache-Control") || "").toLowerCase();
  return !cc.includes("no-store") && !cc.includes("private");
}

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

function offlineFor(url) {
  let best = "/";
  for (const prefix of Object.keys(C.offline)) {
    if (url.pathname.startsWith(prefix) && prefix.length > best.length) best = prefix;
  }
  return C.offline[best] || C.offline["/"];
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || excluded(url)) return;

  // Fingerprinted build assets: immutable by URL, so cache-first is safe.
  if (url.pathname.startsWith("/_astro/")) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (cacheable(res)) {
        const copy = res.clone();
        caches.open(C.assets).then((c) => c.put(req, copy)).then(() => trim(C.assets, C.maxAssets));
      }
      return res;
    })());
    return;
  }

  // Pages: network first, the cache only when the network fails.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        const res = preload || await fetch(req);
        const keep = !C.keep || C.keep.some((p) => url.pathname.startsWith(p));
        if (keep && cacheable(res) && !url.search) {
          const copy = res.clone();
          event.waitUntil(caches.open(C.pages).then((c) => c.put(url.pathname, copy)).then(() => trim(C.pages, C.maxPages)));
        }
        return res;
      } catch (err) {
        const cached = await caches.match(url.pathname, { cacheName: C.pages });
        if (cached) return cached;
        const fallback = await caches.match(offlineFor(url), { cacheName: SHELL });
        return fallback || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
  }
});
`;
}

/** Headers for the `/sw.js` endpoint. `no-cache` so a new build is picked up on the next visit. */
export const SW_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "application/javascript; charset=utf-8",
  "Cache-Control": "no-cache",
  "Service-Worker-Allowed": "/",
};

/** Headers for the manifest endpoint. */
export const MANIFEST_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "application/manifest+json; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
};

/**
 * The request half of the page cache: serve a hit, store a miss, and answer
 * the control plane the admin panel drives.
 *
 * ### The control plane is a ROUTE, not middleware — learned the hard way
 *
 * The obvious design puts it in middleware: middleware runs on every request,
 * and Astro excludes any path segment beginning with `_` from routing, so
 * `src/pages/_cache/rebuild.ts` could never be a route anyway.
 *
 * **Astro does not run middleware for a path no route matches.** `App.render()`
 * matches first and short-circuits into the 404 response, so a middleware-only
 * control plane is unreachable: every rebuild request came back as the site's
 * own 404 page — HTML, no cache activity, and a status code that looks like a
 * misconfigured URL rather than a design mistake. Hence
 * {@link PageCache.control}, which a real endpoint under a routable path (no
 * leading underscore) delegates to.
 *
 * ### The two things a caller must not confuse
 *
 * `purge` deletes; `rebuild` renders and then swaps. Only `rebuild` is safe
 * while the content API is unreachable — a purge in that window empties the
 * site, and every content fetch on these sites is deliberately fail-soft, so
 * the replacement render would succeed and quietly bake the fallbacks in.
 */

import { PageCacheStore, tokenMatches, type CacheEntry } from "./store.js";
import { isCacheableMethod } from "./key.js";
import { resolveEvents, type CacheEvent, type EventMap } from "./events.js";

/** The subset of Astro's middleware context this needs. */
export interface CacheContext {
  request: Request;
  url: URL;
  /**
   * Astro's `context.isPrerendered`.
   *
   * A prerendered route is already a file the web server hands out; it must
   * never be stored, and during `astro build` there is no real request to
   * read. But the ordering matters and is easy to get backwards: **the control
   * plane has to be answered BEFORE this is consulted.** An unmatched path
   * like `/_cache/status` falls through to the 404 route, which is itself
   * prerendered — so a site that skipped the middleware on
   * `isPrerendered` first got Astro's 404 page for every rebuild request,
   * with a cheerful `200`-shaped HTML body and no cache activity at all.
   */
  isPrerendered?: boolean;
}

export type CacheNext = () => Promise<Response>;

export interface PageCacheOptions {
  /** Absolute path of the directory holding rendered pages. */
  dir: string;
  /**
   * Absolute path of the metadata directory. Defaults to `<dir>/.meta`.
   *
   * Production passes one OUTSIDE the web tree: `dir` is reachable from the
   * web by construction — that is what makes a hit free — so a sidecar stored
   * beside a rendered page would be public too. {@link resolveCacheDirs}
   * returns both.
   */
  metaDir?: string;
  /** The site's route knowledge, keyed by event type. */
  events: EventMap;
  /**
   * Shared secret for the control plane. Defaults to `TDS_CACHE_TOKEN`.
   *
   * With no token the control plane answers `503` and the cache still serves
   * and stores. That is deliberate: an unauthenticated rebuild endpoint on a
   * public origin is a free render-amplification attack, and refusing is safer
   * than a default nobody changes.
   */
  token?: string;
  /**
   * Dynamic token source for sites paired at runtime.
   *
   * Takes precedence over `token` and is evaluated for every control or
   * refresh request, so a reconnect works without restarting Node.
   */
  tokenProvider?: () => string;
  /** Master switch. `false` passes everything straight through. */
  enabled?: boolean;
  /**
   * Drop the site's own data memos. Called before any render a rebuild does.
   *
   * Without it a rebuild re-renders the content the process read at boot —
   * see {@link ./memo.js}. This is the single most important option here.
   */
  onInvalidate?: () => void;
  /** Paths a "rebuild everything" always includes, even when not yet cached. */
  alwaysPaths?: string[];
  /** How many pages to render at once during a rebuild. */
  concurrency?: number;
  /** Where diagnostics go. Defaults to `console`. */
  logger?: (message: string) => void;
}

/**
 * Response content types worth storing. Anything else streams past.
 *
 * `application/pdf` is on the list because on these sites a PDF is not a
 * static file: the landingpage's `/legal/agb.pdf` streams a blob out of the
 * CMS on every request. Leaving it off meant the rebuild endpoint reported
 * that path as rebuilt while the middleware quietly declined to store it —
 * the sort of half-truth that makes a cache impossible to reason about.
 */
function isStorable(contentType: string): boolean {
  const t = contentType.toLowerCase();
  return (
    t.includes("text/html") ||
    t.includes("application/xml") ||
    t.includes("text/xml") ||
    t.includes("application/rss+xml") ||
    t.includes("application/json") ||
    t.includes("application/pdf") ||
    // The blog renders per-post social cards on demand. They use the same
    // file-backed cache as HTML so publishing content never requires a build.
    t.includes("image/png")
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** The two halves a site mounts. */
export interface PageCache {
  /**
   * Serves hits and stores misses. The site wraps it with `defineMiddleware`;
   * returning a plain `(context, next)` function is what keeps this package
   * free of the `astro:middleware` virtual module.
   */
  middleware: (context: CacheContext, next: CacheNext) => Promise<Response>;
  /**
   * Answers `status` / `rebuild` / `purge`. Mount it on a REAL route — Astro
   * never runs middleware for an unmatched path, and a path segment beginning
   * with `_` is not routable at all, so the endpoint's directory must carry
   * neither.
   */
  control: (action: string, request: Request, url: URL) => Promise<Response>;
}

/**
 * Build the page cache for one site.
 */
export function pageCache(options: PageCacheOptions): PageCache {
  const {
    dir,
    metaDir,
    events,
    token = process.env.TDS_CACHE_TOKEN ?? "",
    tokenProvider,
    enabled = true,
    onInvalidate,
    alwaysPaths = [],
    concurrency = 4,
    logger = (m: string) => console.warn(m),
  } = options;

  const store = new PageCacheStore(dir, metaDir);
  /** Header that forces a fresh render, used by rebuild's own self-requests. */
  const REFRESH = "x-tds-cache-refresh";

  const currentToken = (): string => {
    try {
      return (tokenProvider?.() ?? token).trim();
    } catch {
      return token.trim();
    }
  };

  async function control(action: string, request: Request, url: URL): Promise<Response> {
    const activeToken = currentToken();
    if (!activeToken) {
      return json({ error: "cache_token_not_configured" }, 503);
    }
    const given =
      request.headers.get("x-tds-cache-token") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      null;
    if (!tokenMatches(activeToken, given)) {
      return json({ error: "unauthorized" }, 401);
    }

    if (action === "status" && request.method === "GET") {
      const entries = await store.list();
      return json({
        directory: store.directory,
        count: entries.length,
        newest: entries[0]?.renderedAt ?? null,
        oldest: entries[entries.length - 1]?.renderedAt ?? null,
        bytes: entries.reduce((sum, e) => sum + e.bytes, 0),
        entries: entries.slice(0, 500),
      });
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    let payload: { events?: CacheEvent[]; paths?: string[]; all?: boolean };
    try {
      payload = (await request.json()) as typeof payload;
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const resolved = await resolveEvents(events, payload.events ?? []);
    const explicit = (payload.paths ?? []).filter((p) => typeof p === "string" && p.startsWith("/"));

    if (action === "purge") {
      if (payload.all) {
        await store.clear();
        onInvalidate?.();
        return json({ purged: "all" });
      }
      const paths = [...new Set([...resolved.paths, ...explicit])];
      await Promise.all(paths.map((p) => store.remove(p)));
      onInvalidate?.();
      return json({ purged: paths, unknownEvents: resolved.unknown });
    }

    if (action !== "rebuild") {
      return json({ error: "not_found" }, 404);
    }

    let paths: string[];
    if (payload.all) {
      const cached = (await store.list()).map((e: CacheEntry) => e.path);
      paths = [...new Set([...cached, ...alwaysPaths])].sort();
    } else {
      paths = [...new Set([...resolved.paths, ...explicit])];
    }

    // Read through on every render this rebuild performs, or it faithfully
    // re-renders the content the process read at boot.
    onInvalidate?.();

    const rebuilt: string[] = [];
    const skipped: string[] = [];
    const failed: Array<{ path: string; status: number | string }> = [];
    const queue = [...paths];

    const worker = async (): Promise<void> => {
      for (;;) {
        const path = queue.shift();
        if (path === undefined) return;
        try {
          const res = await fetch(new URL(path, url.origin), {
            headers: { [REFRESH]: activeToken },
          });
          // Drain the body so the connection is released even when we do not
          // need the bytes — the middleware already stored them.
          await res.arrayBuffer();
          if (!res.ok) {
            failed.push({ path, status: res.status });
          } else if (res.headers.get("x-tds-cache") === "BYPASS") {
            // Rendered fine, stored nothing: an unstorable content type, or a
            // response the render marked `no-store`. Reported separately
            // because calling it "rebuilt" is how a path stays permanently
            // uncached while the panel shows a green result every time.
            skipped.push(path);
          } else {
            rebuilt.push(path);
          }
        } catch (err) {
          failed.push({ path, status: String(err) });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

    return json({
      rebuilt: rebuilt.sort(),
      skipped: skipped.sort(),
      failed,
      unknownEvents: resolved.unknown,
    });
  }

  async function middleware(context: CacheContext, next: CacheNext): Promise<Response> {
    const { request, url } = context;

    // A prerendered route is already a file the web server hands out, and
    // during `astro build` there is no real request to read — touching
    // `context.request` there warns per route and would store build-time
    // renders as if a visitor had asked for them.
    if (context.isPrerendered) return next();

    if (!enabled || !isCacheableMethod(request.method)) return next();

    const activeToken = currentToken();
    const refreshing = activeToken !== "" && tokenMatches(activeToken, request.headers.get(REFRESH));

    if (!refreshing) {
      const hit = await store.read(url.pathname);
      if (hit) {
        if (request.headers.get("if-none-match") === hit.meta.etag) {
          return new Response(null, {
            status: 304,
            headers: { etag: hit.meta.etag, "x-tds-cache": "HIT" },
          });
        }
        // `Buffer` is not a `BodyInit` under the DOM lib; the view is.
        return new Response(request.method === "HEAD" ? null : new Uint8Array(hit.body), {
          status: 200,
          headers: {
            "content-type": hit.meta.contentType,
            etag: hit.meta.etag,
            "x-tds-cache": "HIT",
            "cache-control": "public, max-age=0, must-revalidate",
          },
        });
      }
    }

    const response = await next();

    const contentType = response.headers.get("content-type") ?? "";
    const storable =
      request.method === "GET" &&
      response.status === 200 &&
      isStorable(contentType) &&
      // A response that sets a cookie, or asks not to be stored, is per-visitor
      // by definition. Caching one would hand the next visitor somebody else's
      // page — the single worst failure this component can have.
      !response.headers.has("set-cookie") &&
      !(response.headers.get("cache-control") ?? "").includes("no-store");

    if (!storable) {
      const out = new Response(response.body, response);
      out.headers.set("x-tds-cache", "BYPASS");
      return out;
    }

    // Buffer once and hand back a fresh Response rather than cloning: a clone
    // whose body is never read keeps the stream alive, and Astro's response
    // bodies are streams.
    const body = Buffer.from(await response.arrayBuffer());
    let etag: string | undefined;
    try {
      const meta = await store.write(url.pathname, body, contentType);
      etag = meta?.etag;
    } catch (err) {
      // An unwritable cache directory must not take the site down; it just
      // means every request renders, which is what happened before this
      // component existed.
      logger(`[tds-cache] could not store ${url.pathname}: ${String(err)}`);
    }

    const headers = new Headers(response.headers);
    headers.set("x-tds-cache", refreshing ? "REFRESH" : "MISS");
    headers.set("cache-control", "public, max-age=0, must-revalidate");
    if (etag) headers.set("etag", etag);

    return new Response(new Uint8Array(body), { status: 200, headers });
  }

  return {
    middleware,
    control: async (action, request, url) => {
      try {
        return await control(action, request, url);
      } catch (err) {
        logger(`[tds-cache] control request failed: ${String(err)}`);
        return json({ error: "internal" }, 500);
      }
    },
  };
}

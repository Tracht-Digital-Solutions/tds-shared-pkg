/**
 * The request half of the page cache: serve a hit, store a miss, and answer
 * the control plane the admin panel drives.
 *
 * ### Why the control plane lives in middleware and not in a route
 *
 * Astro excludes any path segment beginning with `_` from routing, so
 * `src/pages/_cache/rebuild.ts` is not a route and never will be. That is
 * convenient rather than limiting: the control endpoints must be reachable
 * even when every page route is failing, and middleware is the only layer that
 * still runs then.
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
}

export type CacheNext = () => Promise<Response>;

export interface PageCacheOptions {
  /** Absolute path of the cache directory. */
  dir: string;
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
  /** Master switch. `false` passes everything straight through. */
  enabled?: boolean;
  /** Control-plane mount point. */
  controlPrefix?: string;
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

/** Response content types worth storing. Anything else streams past. */
function isStorable(contentType: string): boolean {
  const t = contentType.toLowerCase();
  return (
    t.includes("text/html") ||
    t.includes("application/xml") ||
    t.includes("text/xml") ||
    t.includes("application/rss+xml") ||
    t.includes("application/json")
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * Build the middleware.
 *
 * Returns a plain `(context, next)` function rather than an Astro
 * `MiddlewareHandler`, so this package never imports the `astro:middleware`
 * virtual module. The consuming site wraps it with `defineMiddleware`.
 */
export function pageCache(options: PageCacheOptions) {
  const {
    dir,
    events,
    token = process.env.TDS_CACHE_TOKEN ?? "",
    enabled = true,
    controlPrefix = "/_cache",
    onInvalidate,
    alwaysPaths = [],
    concurrency = 4,
    logger = (m: string) => console.warn(m),
  } = options;

  const store = new PageCacheStore(dir);
  /** Header that forces a fresh render, used by rebuild's own self-requests. */
  const REFRESH = "x-tds-cache-refresh";

  async function control(context: CacheContext): Promise<Response> {
    const { request, url } = context;
    const action = url.pathname.slice(controlPrefix.length).replace(/^\/+/, "");

    if (!token) {
      return json({ error: "cache_token_not_configured" }, 503);
    }
    const given =
      request.headers.get("x-tds-cache-token") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      null;
    if (!tokenMatches(token, given)) {
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

    const resolved = resolveEvents(events, payload.events ?? []);
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
    const failed: Array<{ path: string; status: number | string }> = [];
    const queue = [...paths];

    const worker = async (): Promise<void> => {
      for (;;) {
        const path = queue.shift();
        if (path === undefined) return;
        try {
          const res = await fetch(new URL(path, url.origin), {
            headers: { [REFRESH]: token },
          });
          // Drain the body so the connection is released even when we do not
          // need the bytes — the middleware below already stored them.
          await res.arrayBuffer();
          if (res.ok) rebuilt.push(path);
          else failed.push({ path, status: res.status });
        } catch (err) {
          failed.push({ path, status: String(err) });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

    return json({
      rebuilt: rebuilt.sort(),
      failed,
      unknownEvents: resolved.unknown,
    });
  }

  return async function pageCacheMiddleware(
    context: CacheContext,
    next: CacheNext,
  ): Promise<Response> {
    const { request, url } = context;

    if (url.pathname === controlPrefix || url.pathname.startsWith(controlPrefix + "/")) {
      try {
        return await control(context);
      } catch (err) {
        logger(`[tds-cache] control request failed: ${String(err)}`);
        return json({ error: "internal" }, 500);
      }
    }

    if (!enabled || !isCacheableMethod(request.method)) return next();

    const refreshing = token !== "" && tokenMatches(token, request.headers.get(REFRESH));

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
  };
}

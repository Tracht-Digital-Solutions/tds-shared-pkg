# `src/cache/` and `src/site/`: the public sites' server side

## Page cache (`@tracht-digital-solutions/tds-shared/cache`)

The public SSR sites render on demand and store each page as a plain file the web server serves directly. A hit costs
what a static build cost; a content change costs one render. The sites supply only their route knowledge. It imports
Node builtins, so it has its own entry point and is **never re-exported from `./index`**.

### The four pieces

- **`pageCache(options)`** returns `.middleware` (serves hits, stores misses; a plain `(context, next)` function the site
  wraps with `defineMiddleware`) and `.control` (`status` / `rebuild` / `purge`, mounted on a real route).
- **`resolveEvents(map, events)`**: "this content changed" → "these pages are stale"; each site brings its `EventMap`.
- **`createGenerationCache()`**: the memo a rebuild throws away.
- **`PageCacheStore`**: the on-disk layout (`preise/index.html`), so the web server needs no special knowledge.

### One process, many hosts (`tds-card-frontend`)

`cacheKey` and `rebuildUrl` are inverses and only work as a pair. Pathname keys would make two customer domains share `/`;
without `rebuildUrl`, a rebuild requests the key off its own origin. Map dots out of a host before using it as a key
segment, and point the store **outside** the document root (`TDS_CACHE_DIR`), since Apache doesn't know the key.

### Easy to get wrong

- **A cached page must never outlive its build.** The store survives deploys by design, but stored HTML names hashed
  assets that a deploy rotates. `resolveCacheDirs` fingerprints asset filenames and empties the store when they change; an
  absent marker counts as a mismatch.
- **The control plane must not be middleware** (Astro doesn't run middleware for unmatched paths) and can't live under
  `_cache/` (segments starting with `_` aren't routed). Sites mount it at `/tds/cache/{action}`.
- **A POST to it needs `Content-Type: application/json`** (`security.checkOrigin`).
- **Resolvers may be async** (the blog looks up an article's taxonomy); a throwing resolver loses only its own event.
- **`purge` ≠ `rebuild`.** Only `rebuild` (render, then swap atomically) is safe during an API outage; after a purge the
  fail-soft render bakes in fallbacks.
- **A module-level memo is permanent in a server**; wire `onInvalidate` to the site's own caches.
- **Never store a response carrying `Set-Cookie`** or `Cache-Control: no-store`. No public page renders session-dependent
  content server-side (`AccountMenu` is a client island); keep it that way.
- **The query string is not part of the key** (else `?1`, `?2` … fill the disk). A route that reads a parameter must opt
  out of caching.

### The token

`TDS_CACHE_TOKEN` authenticates the control plane (hashed, constant-time compare). **Without a token it answers 503.** The
token belongs in the host's Node environment, never in `tds-runtime.json` (served publicly).

## `src/site/` (`./site`)

Server-side helpers the public sites used to copy; no `node:` imports; never re-exported from the root.

- **`createSiteKeyGuard(connection, { label, reconnectHint })`**: site-key headers and `assertKeyAccepted`, which counts a
  401/403 on `globalThis` before throwing. **`guardSiteKey(next)`** marks a render that grew the count `no-store`; mount it
  inside the cache middleware.
- **`createContentReader(guard)`**: fetch with the key, a 10 s timeout, and a throw (`ContentHttpError`) on any non-2xx.
  `isConnectionFailure(err)` is the only test for "demo content is a fair stand-in".
- **`memoisedOr(cache, key, load, fallback)`** remembers successes only (a loader resolving `{}` on failure would pin the
  fallback for a generation).
- `escapeXml`, `renderSitemapIndex(sitemaps, lastmod?)`, `serializeJsonLd` (escapes `<` and U+2028/2029 so panel text can't
  close the script tag).

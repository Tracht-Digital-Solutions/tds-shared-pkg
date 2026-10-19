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

### Sitemap, exclusions, images, scripts (0.59)

- `createSitemapExclusions({ siteId, contentBase, read, memo, hreflangGroup?, disabled? })` → `exclusionPatterns`,
  `isExcluded`. The site injects its keyed reader, its generation memo and its language-twin mapping (prefix on
  the tools site, translated taxonomy segments on the journal). Fail-soft: nothing excluded.
- `renderUrlset(urls)` / `renderSitemapUrl` take absolute URLs; the site maps its own entry shape.
  `defineSitemapSections([...])` gives `sections`, `isSection`, `sectionPath`, `paths` (what the cache rebuilds).
- `createImageCatalog(json, { origin, about })` for the generated `imageCatalog.json`.
- `./i18n`: `OG_LOCALE`, `neutralPath`, `localizedPath` (same-slug `/en/` trees). `./nav`: `LEGAL_LINKS`.
- `./pwa`: `mountOfflineList(list, { match, english, empty })` for the offline fallback page.
- **Bins:** `tds-geo-audit` (each site keeps only `scripts/geo-audit.profile.mjs`, default export) and
  `tds-lint-primitives` (the union of the two allow-lists that had formed). A new allowed primitive class goes
  into `scripts/lint-primitives.mjs` here, in the same release as its CSS.

## Build gate (0.55.2)

Cache hits are served by the web server straight from disk; the app's boot-time flush never sees
them. After a deploy, cached pages kept naming the previous build's deleted `/_astro` CSS and went out
unstyled until an uncached URL booted Node. Now:

- On boot `resolveCacheDirs()` writes `_tds-cache/.build-<fingerprint>` (`BUILD_GATE_PREFIX`) next to
  the meta marker, after a flush and on an unchanged reboot. `PageCacheStore.clear()` keeps both.
- `scripts/pack-release.mjs` drops a unique `_astro/.release-<id>` first (0.55.4: a markup-only build
  kept every asset name, so the journal served stale pages after a deploy), then replaces
  `@TDS_BUILD@` in `client/.htaccess` with the same fingerprint
  (`dirs.test.ts` pins the formula in both places).
- Every cache rule in a consumer's `.htaccess` adds
  `RewriteCond %{DOCUMENT_ROOT}/_tds-cache/.build-@TDS_BUILD@ -f`. Unreplaced, it never matches: every
  request goes to Node — slower, never stale.

## The cache's day (0.55.3)

Entries live until the end of the day they were rendered on (≤ 24 h). `pageCache({ dailyRefresh })`
(default true) calls `ensureDailyGate()` (`src/cache/daily.ts`) on every request Node sees: it writes
`_tds-cache/.build-<fp>-<YYYYMMDD>` for today's local and UTC date, and on a new LOCAL day first
empties pages and meta (build records kept, old dated gates removed). Consumers' `.htaccess` gate on
`.build-@TDS_BUILD@-%{TIME_YEAR}%{TIME_MON}%{TIME_DAY}`, so after midnight the first request reaches
Node. Per-render samples (landing page examples) are redrawn daily; the shop never serves a partner
price rendered more than a day ago.

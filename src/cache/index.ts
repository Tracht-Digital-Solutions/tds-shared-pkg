/**
 * Server-side page cache for the three public Astro sites.
 *
 * Consumed as `@tracht-digital-solutions/tds-shared/cache`. **This entry point
 * imports `node:fs`, `node:path` and `node:crypto` and is therefore NEVER
 * re-exported from the package root** — `tds-shared`'s root entry is pulled
 * into every browser bundle in the workspace, and a Node builtin there breaks
 * all of them at once.
 *
 * ### What it is for
 *
 * The public sites used to be static builds: the only cache between the
 * database and a visitor was the build itself, so a corrected typo in one blog
 * article meant a full CI rebuild of every page, DeepL translations and one OG
 * image per post included. These sites now render on demand and store the
 * result as a plain file the web server serves directly, so a content change
 * costs one page render instead of one deploy — while a cache hit costs
 * exactly what the static file cost, because it *is* one.
 *
 * ### The four pieces
 *
 * - {@link pageCache} — the middleware: serves hits, stores misses, and hosts
 *   the `/_cache/*` control plane the admin panel drives.
 * - {@link resolveEvents} — the pure translation from "this content changed"
 *   to "these pages are now stale". Each site supplies its own map; the API
 *   never learns a URL scheme.
 * - {@link createGenerationCache} — the replacement for the module-level
 *   memos that are correct in a build and permanent in a server.
 * - {@link PageCacheStore} — the on-disk layout, mirroring what the static
 *   build produced so the web server can serve it with no special knowledge.
 * - {@link resolveCacheDirs} — where that store lives, and the self-healing
 *   symlink that lets the web server reach it across deploys.
 */

export { pageCache } from "./middleware.js";
export type { CacheContext, CacheNext, PageCacheOptions } from "./middleware.js";

export { forLanguages, resolveEvents } from "./events.js";
export type { CacheEvent, EventMap, EventResolver, ResolvedEvents } from "./events.js";

export { createGenerationCache } from "./memo.js";
export type { GenerationCache } from "./memo.js";

export { PageCacheStore, tokenMatches } from "./store.js";
export type { CacheEntry, CacheMeta, StoredPage } from "./store.js";

export { cacheLocation, isCacheableMethod } from "./key.js";
export type { CacheLocation } from "./key.js";

export { CACHE_LINK_NAME, resolveCacheDirs } from "./dirs.js";
export type { CacheDirs, ResolveCacheDirsOptions } from "./dirs.js";

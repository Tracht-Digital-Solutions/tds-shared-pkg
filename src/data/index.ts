/**
 * Client-side data cache with stale-while-revalidate semantics.
 *
 * ### Why this exists
 *
 * The panel products render on demand and navigate with Astro's `ClientRouter`,
 * so the document is swapped rather than reloaded — but every React island on
 * the incoming page mounts fresh, and until now each one opened with
 * `useState(null)` and a `useEffect` fetch. The result was a panel that looked
 * like it reloaded on every click: back to a list you visited ten seconds ago
 * and it was blank again for the length of a round trip.
 *
 * This module keeps the answers in memory for the life of the tab, so a
 * revisited screen paints its previous contents **immediately** and the fresh
 * copy replaces them when it lands. That is the whole trick — the network cost
 * is unchanged, the perceived cost is gone.
 *
 * ### The honesty rule
 *
 * A cached value on screen is data that may already be wrong, so it must never
 * be presented as current. While a revalidation is in flight the consumer marks
 * its container `tds-stale` (dimmed and pulsing, see `primitives.css`) and sets
 * `aria-busy`. The alternative — showing month-old rows as though they were
 * live — is the failure mode this whole codebase keeps running into: a calm,
 * confident, wrong screen with nothing red anywhere.
 *
 * ### In memory only, deliberately
 *
 * Nothing here touches `localStorage` or `sessionStorage`. The panel is behind
 * a login and these payloads are other people's invoices, tickets and messages;
 * persisting them would leave them readable on the device after logout, which a
 * revalidation delay does not remotely justify. A full reload starts cold, and
 * that is correct.
 *
 * ### Not to be confused with `@tracht-digital-solutions/tds-shared/cache`
 *
 * That one is the public sites' server-side, file-backed *page* cache. This one
 * is a per-tab, in-memory *data* cache in the browser. They share no code and
 * solve opposite problems.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { apiFetch } from "../api/index.js";

/** One cached answer, with the moment it arrived. */
export interface CacheEntry<T> {
  value: T;
  /** `Date.now()` at the time the value was stored. */
  at: number;
}

/** What {@link useCachedResource} hands a component. */
export interface CachedResource<T> {
  /** The last known value, or `undefined` when nothing has ever arrived. */
  data: T | undefined;
  /**
   * A previous value is on screen while a fresh one is on the way.
   *
   * Drive the `tds-stale` class from this — never from `loading`, which is the
   * first-ever load and wants a skeleton instead.
   */
  stale: boolean;
  /** Nothing to show yet and a request is out. */
  loading: boolean;
  /**
   * The last failure, kept alongside the stale data rather than replacing it.
   *
   * A list that empties itself because one refresh failed is the calm-empty-
   * state bug; keep showing what you have and say that it is old.
   */
  error: Error | null;
  /** Force a revalidation now (after a save, or from a "Neu laden" control). */
  refresh: () => void;
}

/** Options for {@link useCachedResource}. */
export interface CachedResourceOptions {
  /**
   * How long a cached value counts as fresh, in ms. Within the window a mount
   * does not revalidate at all, so flipping between two screens is instant and
   * silent; past it the value still paints immediately but is marked stale
   * while it refreshes.
   *
   * The default is tuned for panel navigation: long enough that a click-through
   * and a click-back cost nothing, short enough that a screen left open does
   * not go quietly out of date.
   */
  staleTime?: number;
  /**
   * Skip the fetch entirely (a `null` key does the same). Use it for a resource
   * that depends on a selection the user has not made yet.
   */
  enabled?: boolean;
}

/** The default freshness window — see {@link CachedResourceOptions.staleTime}. */
export const DEFAULT_STALE_TIME = 30_000;

const entries = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const errors = new Map<string, Error>();
const subscribers = new Map<string, Set<() => void>>();
/** Keys whose cached answer is known to be out of date. */
const invalidated = new Set<string>();

/**
 * A monotonically increasing counter per key.
 *
 * `useSyncExternalStore` compares snapshots with `Object.is`, so the snapshot
 * has to be a primitive that changes on every write — returning the entry
 * object itself would work for replacement but not for an in-place error or
 * pending flip, and returning a fresh object every call is an infinite loop.
 */
const versions = new Map<string, number>();

/**
 * A second counter, bumped **only** by {@link invalidate} and
 * {@link resetCache}.
 *
 * The hook's effect keys on this rather than on `versions`, and the split is
 * load-bearing: `versions` moves on every arrival, so an effect watching it
 * would re-run the moment a value lands — and with `staleTime: 0` that is an
 * unbounded fetch loop. The epoch moves only when somebody *declares* the
 * cached answer wrong, which is exactly when a mounted consumer must go and
 * ask again.
 */
const epochs = new Map<string, number>();

function bump(key: string): void {
  versions.set(key, (versions.get(key) ?? 0) + 1);
  const set = subscribers.get(key);
  if (set) for (const fn of [...set]) fn();
}

/** Bump the invalidation epoch and notify, in that order. */
function bumpEpoch(key: string): void {
  epochs.set(key, (epochs.get(key) ?? 0) + 1);
  bump(key);
}

/** Subscribe to changes for one key. Returns the unsubscribe function. */
export function subscribe(key: string, listener: () => void): () => void {
  let set = subscribers.get(key);
  if (!set) {
    set = new Set();
    subscribers.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) subscribers.delete(key);
  };
}

/** Read a cached entry without triggering a fetch. */
export function peek<T>(key: string): CacheEntry<T> | undefined {
  return entries.get(key) as CacheEntry<T> | undefined;
}

/** Store a value directly — for a mutation that already knows the new state. */
export function put<T>(key: string, value: T): void {
  // A GET that started before this mutation is older than the value being
  // written. Removing its identity makes its eventual answer fail the guard
  // in `revalidate` instead of overwriting the mutation with old server data.
  inflight.delete(key);
  entries.set(key, { value, at: Date.now() });
  errors.delete(key);
  invalidated.delete(key);
  bump(key);
}

/**
 * Mark cached entries stale and tell every mounted consumer to revalidate.
 *
 * `prefix` is matched with `startsWith`, because keys are API paths and a
 * mutation usually invalidates a family: saving one block dates
 * `/cms/<site>/blocks` *and* `/cms/<site>/blocks/<key>`. Called with no
 * argument it marks every known key stale. Use {@link resetCache} when the
 * values themselves must be discarded (tests, logout without a full unload).
 *
 * The previous value deliberately stays in `entries`. Removing it here would
 * make a mounted list fall back to its first-load skeleton between a save and
 * the replacement GET — exactly the blank flash SWR exists to prevent. Once
 * the replacement request starts, the hook therefore returns that value with
 * `stale: true` until the fresh answer arrives.
 *
 * In-flight requests are abandoned rather than cancelled: their results are
 * discarded on arrival (see the identity check in `revalidate`), so a save
 * followed immediately by an invalidate can never be overwritten by the
 * response to the request that preceded it.
 */
export function invalidate(prefix?: string): void {
  const keys = prefix === undefined ? [...entries.keys()] : [...entries.keys()].filter((k) => k.startsWith(prefix));
  // Subscribed keys with nothing cached yet still have to be told: a component
  // that failed its first load is subscribed but holds no entry, and it is
  // exactly the one that should retry.
  const listening = prefix === undefined ? [...subscribers.keys()] : [...subscribers.keys()].filter((k) => k.startsWith(prefix));
  for (const key of new Set([...keys, ...listening])) {
    errors.delete(key);
    inflight.delete(key);
    invalidated.add(key);
    bumpEpoch(key);
  }
}

/** Wipe the whole cache and every pending request. For tests and for logout. */
export function resetCache(): void {
  entries.clear();
  inflight.clear();
  errors.clear();
  invalidated.clear();
  const keys = [...subscribers.keys()];
  for (const key of keys) bumpEpoch(key);
}

/**
 * Fetch for `key` unless an identical request is already out.
 *
 * De-duplication matters more here than in a typical SWR setup: the panel
 * dashboard mounts up to a dozen widget islands at once and several read the
 * same summary endpoint.
 */
function revalidate<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const request = fetcher()
    .then((value) => {
      // Only store it if this request is still the current one. An
      // `invalidate()` during the flight deletes the map entry, and writing
      // the answer anyway would resurrect precisely the state the caller just
      // said was wrong.
      if (inflight.get(key) === request) {
        inflight.delete(key);
        entries.set(key, { value, at: Date.now() });
        errors.delete(key);
        invalidated.delete(key);
        bump(key);
      }
      return value;
    })
    .catch((cause: unknown) => {
      if (inflight.get(key) === request) {
        inflight.delete(key);
        errors.set(key, cause instanceof Error ? cause : new Error(String(cause)));
        // The VALUE is deliberately left in place — a failed refresh must not
        // blank a working screen.
        bump(key);
      }
      throw cause;
    });

  inflight.set(key, request);
  bump(key);
  return request;
}

/**
 * Read `key`, painting whatever is cached immediately and refreshing behind it.
 *
 * `fetcher` is read through a ref, so an inline arrow in the call site does not
 * re-trigger the effect on every render — the *key* is the identity of the
 * request, which is why it is a required string rather than derived from the
 * function.
 */
export function useCachedResource<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: CachedResourceOptions = {},
): CachedResource<T> {
  const { staleTime = DEFAULT_STALE_TIME, enabled = true } = options;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // A local counter so `refresh()` can force a fetch that the freshness window
  // would otherwise skip.
  const [nonce, setNonce] = useState(0);

  const listen = useCallback(
    (listener: () => void) => (key === null ? () => {} : subscribe(key, listener)),
    [key],
  );
  // Server snapshot on both: an island's SSR pass has no cache and must not
  // read one, or the markup React hydrates against would differ from the
  // server's.
  const zero = useCallback(() => 0, []);

  // Re-render on every write to this key (arrival, failure, request start).
  // During hydration React deliberately returns the `zero` server snapshot
  // once, even when this tab already has a cached entry from the page we just
  // left. Use that signal below: reading the module maps on that first pass
  // would make the client render cached rows against the server's empty HTML
  // and trigger a hydration mismatch. React checks the live snapshot
  // immediately afterwards, so the cached rows still appear before the next
  // paint rather than flashing a first-load state.
  const version = useSyncExternalStore(listen, () => (key === null ? 0 : (versions.get(key) ?? 0)), zero);
  // Re-RUN THE EFFECT only when somebody invalidated this key. See `epochs`.
  const epoch = useSyncExternalStore(listen, () => (key === null ? 0 : (epochs.get(key) ?? 0)), zero);

  const active = key !== null && enabled;

  useEffect(() => {
    if (!active || key === null) return;
    const entry = entries.get(key);
    // Fresh enough, and nobody asked for a forced refresh: do nothing at all.
    // This is what makes navigating away and back cost zero requests.
    if (
      nonce === 0 &&
      !invalidated.has(key) &&
      entry !== undefined &&
      Date.now() - entry.at < staleTime
    ) return;
    void revalidate(key, fetcherRef.current).catch(() => {
      // Already recorded on the entry; rethrowing here would surface as an
      // unhandled rejection in every browser console.
    });
  }, [active, key, staleTime, nonce, epoch]);

  const hasClientSnapshot = version !== 0;
  const entry =
    key === null || !hasClientSnapshot ? undefined : (entries.get(key) as CacheEntry<T> | undefined);
  const pending = key !== null && hasClientSnapshot && inflight.has(key);

  const refresh = useCallback(() => {
    if (key !== null) inflight.delete(key);
    setNonce((n) => n + 1);
  }, [key]);

  return {
    data: entry?.value,
    stale: pending && entry !== undefined,
    loading: pending && entry === undefined,
    error: key === null || !hasClientSnapshot ? null : (errors.get(key) ?? null),
    refresh,
  };
}

/** Thrown by {@link useCachedJson} when the API answers with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`HTTP ${status} für ${path}`);
    this.name = "ApiError";
  }
}

/**
 * The panel's everyday case: GET a JSON document from the composed API.
 *
 * Goes through `apiFetch`, so it inherits the absolute API base and the
 * 401→`/me`-probe backstop — a relative `fetch` here would hit the product's
 * own host, and the panel's SPA fallback used to answer those with `200` and
 * HTML.
 *
 * It **throws** on a non-2xx rather than returning a fallback. The
 * `.catch(() => setRows([]))` habit is what turned a 403 into "Keine Einträge."
 * for months; here the failure reaches `error`, the previous rows stay on
 * screen, and the consumer can say what actually happened *with the status
 * code*, which is what separates "session expired" from "service down".
 */
export function useCachedJson<T>(
  path: string | null,
  options: CachedResourceOptions = {},
): CachedResource<T> {
  return useCachedResource<T>(
    path,
    async () => {
      const res = await apiFetch(path as string);
      if (!res.ok) throw new ApiError(res.status, path as string);
      return (await res.json()) as T;
    },
    options,
  );
}

/**
 * The class list for a container whose contents are being replaced.
 *
 * A helper rather than a hand-written ternary at every call site: the point of
 * the treatment is that it looks the same everywhere, so someone reading one
 * screen learns what dimming means on all of them.
 */
export function staleClass(stale: boolean, base = ""): string {
  return stale ? `${base} tds-stale`.trim() : base;
}

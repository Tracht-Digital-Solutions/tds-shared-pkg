import type { GenerationCache } from "../cache/memo";
import type { SiteKeyGuard } from "./siteKey";

/** A reachable API answered, but not with a 2xx. */
export class ContentHttpError extends Error {
  readonly status: number;

  constructor(status: number, url: string | URL) {
    super(`HTTP ${status} from ${String(url)}`);
    this.name = "ContentHttpError";
    this.status = status;
  }
}

/**
 * One read against the content API: the site-key headers, a timeout, the key
 * check, and a THROW on any non-2xx — so the caller decides, in one place,
 * what a failure renders as.
 *
 * Four sites carried their own version, each spelling the failure differently;
 * the blog's had no timeout at all, so a hanging API held a render open.
 */
export function createContentReader(guard: Pick<SiteKeyGuard, "siteKeyHeaders" | "assertKeyAccepted">) {
  return async function readContentJson<T>(url: string | URL, timeoutMs = 10_000): Promise<T> {
    const res = await fetch(url, { headers: guard.siteKeyHeaders(), signal: AbortSignal.timeout(timeoutMs) });
    guard.assertKeyAccepted(res, url);
    if (!res.ok) throw new ContentHttpError(res.status, url);
    return (await res.json()) as T;
  };
}

/**
 * Did the request never get an answer — refused, unreachable, timed out?
 *
 * Only then is DEMO content a fair stand-in. A reachable API answering 5xx, or
 * rejecting the site key, is not an outage of that kind.
 */
export function isConnectionFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  return err.name !== "ContentHttpError" && err.name !== "SiteKeyRejectedError";
}

/**
 * Memoise a SUCCESSFUL read for the render generation, and answer `fallback`
 * on a failed one without remembering it.
 *
 * Catching inside the loader is the trap this exists for: {@link GenerationCache}
 * only evicts a rejection, so a loader that resolved `{}` on failure pinned the
 * fallback for the whole generation — every later page was stored with default
 * content, and a rejected site key was counted on the first render only.
 */
export async function memoisedOr<T>(
  cache: GenerationCache,
  key: string,
  load: () => Promise<T>,
  fallback: T | (() => T),
  warn: (message: string, err: unknown) => void = (message, err) => console.warn(message, err),
): Promise<T> {
  try {
    return await cache.get(key, load);
  } catch (err) {
    warn(`${key} unavailable — using the fallback:`, err);
    return typeof fallback === "function" ? (fallback as () => T)() : fallback;
  }
}

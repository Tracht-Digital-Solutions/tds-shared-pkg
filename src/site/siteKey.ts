/**
 * The site key a public site presents to the composed API, and what happens
 * when the API rejects it.
 *
 * Every public site carried a 49-line copy of this that differed only in its
 * log prefix. One implementation now; each site passes its own label.
 *
 * ### Why a rejection is COUNTED and not just thrown
 *
 * Every content read on the public sites is fail-soft: a rejected key produces
 * a perfectly valid page full of baked fallbacks. Cached, that page outlives
 * the misconfiguration with nothing to see. So `assertKeyAccepted` bumps a
 * process-wide counter before it throws, and {@link guardSiteKey} refuses to let
 * the page cache store any response whose render grew it.
 *
 * The counter hangs off `globalThis`, not a module variable: Astro's config and
 * its page modules are separate module graphs, and a second copy of this
 * module would otherwise count into its own private zero.
 */

/** What a site's paired connection (tds-shared/connection) offers here. */
export interface SiteKeySource {
  siteKey(): string;
  siteKeyHeaders(): Record<string, string> | undefined;
}

export interface SiteKeyGuardOptions {
  /** Log prefix, e.g. `tds-blog`. */
  label: string;
  /** The second sentence of the error: how an operator fixes it. */
  reconnectHint: string;
}

export class SiteKeyRejectedError extends Error {
  readonly status: number;

  constructor(status: number, url: string, label = "tds-site", reconnectHint = "") {
    super(
      `[${label}] Der gekoppelte API-Zugang wurde abgelehnt (HTTP ${status}) von ${url}.` +
        (reconnectHint ? ` ${reconnectHint}` : ""),
    );
    this.name = "SiteKeyRejectedError";
    this.status = status;
  }
}

const COUNTER = "__tdsSiteKeyRejectionCount__" as const;

/** How many reads the API has rejected in this process. */
export function siteKeyRejectionCount(): number {
  return ((globalThis as Record<string, unknown>)[COUNTER] as number | undefined) ?? 0;
}

function countRejection(): void {
  const store = globalThis as Record<string, unknown>;
  store[COUNTER] = ((store[COUNTER] as number | undefined) ?? 0) + 1;
}

export interface SiteKeyGuard {
  currentSiteKey(): string;
  siteKeyHeaders(): Record<string, string> | undefined;
  /** Throws {@link SiteKeyRejectedError} (after counting it) on a 401/403 to a keyed read. */
  assertKeyAccepted(res: Response, url: string | URL): void;
}

export function createSiteKeyGuard(source: SiteKeySource, options: SiteKeyGuardOptions): SiteKeyGuard {
  return {
    currentSiteKey: () => source.siteKey(),
    siteKeyHeaders: () => source.siteKeyHeaders(),
    assertKeyAccepted(res, url) {
      // Without a key there is nothing to reject: the read was anonymous.
      if (source.siteKey() === "") return;
      if (res.status !== 401 && res.status !== 403) return;
      countRejection();
      throw new SiteKeyRejectedError(res.status, String(url), options.label, options.reconnectHint);
    },
  };
}

/**
 * Wrap a render so the page cache never stores it if the API rejected the site
 * key meanwhile. Mount it INSIDE the cache middleware (`sequence(cache, guard)`):
 * the `no-store` has to be on the response before the cache decides.
 *
 * Two requests racing can only make this refuse to store a page that was fine;
 * it can never make it store one that was not.
 */
export async function guardSiteKey(next: () => Promise<Response>): Promise<Response> {
  const before = siteKeyRejectionCount();
  const response = await next();
  if (siteKeyRejectionCount() === before) return response;
  const guarded = new Response(response.body, response);
  guarded.headers.set("cache-control", "no-store");
  return guarded;
}

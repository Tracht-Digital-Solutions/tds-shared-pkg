/**
 * Paths the panel has taken out of a site's index — the subtraction on top of
 * the sitemap the site builds from its corpus.
 *
 * Promoted in 0.59 from the landing page, the journal and the tools site,
 * which kept the same matcher and loader with a different `SITE_ID`. What
 * differs per site is injected: how a URL maps to its language twin (a pure
 * prefix on the tools site, translated taxonomy segments on the journal), the
 * content reader (it needs the site's key) and the generation memo.
 *
 * ### Fail-soft, in the safe direction
 *
 * Every failure answers "nothing excluded". The opposite default would empty
 * the sitemap on an API hiccup, and because the API's own route is fail-soft
 * too, neither end would go red.
 */

/** Trailing slash folded away, root kept — `trailingSlash: "ignore"` in the Astro configs. */
export function canonicalPath(path: string): string {
  const value = path.trim();
  if (value === "" || value === "/") return "/";
  return value.replace(/\/+$/, "") || "/";
}

/**
 * One pattern against one path: an exact path, or a trailing `*` making it a
 * raw prefix. The same two rules the API validates — a glob library here
 * would accept patterns the API rejects, and the disagreement would only ever
 * show as a page that quietly stayed indexed.
 */
export function matchesPattern(path: string, pattern: string): boolean {
  const value = pattern.trim();
  if (value === "") return false;
  if (value.endsWith("*")) {
    const prefix = value.slice(0, -1);
    return prefix === "" || canonicalPath(path).startsWith(prefix);
  }
  return canonicalPath(value) === canonicalPath(path);
}

/**
 * Does any pattern hit any member of this hreflang group? A pattern matching
 * either language excludes both: one dangling alternate invalidates the whole
 * `hreflang` set, the other language included.
 */
export function groupExcluded(paths: readonly string[], patterns: readonly string[]): boolean {
  return paths.some((path) => patterns.some((pattern) => matchesPattern(path, pattern)));
}

export interface SitemapExclusionsOptions {
  /** This site's id in the panel's site registry (`landingpage`, `blog`, `tools`, …). */
  siteId: string;
  /** The content API base, e.g. `https://api.…/content`. Read per call (the runtime config may change). */
  contentBase: () => string;
  /** The site's keyed reader; throws on failure. */
  read: <T>(url: string) => Promise<T>;
  /** The site's generation memo: remembers successes only, returns `fallback` on failure. */
  memo: (key: string, load: () => Promise<string[]>, fallback: string[], label: string) => Promise<string[]>;
  /** Every URL of one page across languages. Default: the path alone. */
  hreflangGroup?: (path: string) => string[];
  /** Demo/preview builds read nothing. */
  disabled?: boolean;
}

export interface SitemapExclusions {
  /** The patterns, memoised for the render generation (never a module-level promise: SSR lives long). */
  exclusionPatterns: () => Promise<string[]>;
  /** Is this page excluded — counting its twin in the other language as the same page? */
  isExcluded: (path: string) => Promise<boolean>;
}

export function createSitemapExclusions(o: SitemapExclusionsOptions): SitemapExclusions {
  const group = o.hreflangGroup ?? ((path: string) => [canonicalPath(path)]);

  const load = async (): Promise<string[]> => {
    const url = new URL(`${o.contentBase()}/sitemap-exclusions`);
    url.searchParams.set("site", o.siteId);
    const data = await o.read<{ paths?: unknown }>(url.toString());
    if (!Array.isArray(data?.paths)) return [];
    return data.paths.filter((p): p is string => typeof p === "string" && p.trim() !== "");
  };

  const exclusionPatterns = (): Promise<string[]> =>
    o.disabled ? Promise.resolve([]) : o.memo("sitemap:exclusions", load, [], "sitemap exclusions (nothing excluded)");

  const isExcluded = async (path: string): Promise<boolean> => {
    const patterns = await exclusionPatterns();
    return patterns.length > 0 && groupExcluded(group(path), patterns);
  };

  return { exclusionPatterns, isExcluded };
}

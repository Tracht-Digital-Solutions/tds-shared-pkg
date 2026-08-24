/**
 * Turning a request URL into a file path under the cache directory.
 *
 * One function, not three copies, because a sloppy normalisation here is a
 * cache-poisoning bug rather than a cosmetic one: two URLs that must not share
 * an entry sharing one is how a visitor gets served somebody else's page.
 */

/** Where an entry lives, relative to its directory. Always POSIX-ish. */
export interface CacheLocation {
  /**
   * The HTML/asset file itself, relative to the PAGES directory —
   * e.g. `preise/index.html` or `rss.xml`.
   */
  file: string;
  /**
   * Its metadata sidecar, relative to the META directory — e.g. `preise.json`.
   *
   * Two directories rather than one, because in production the pages
   * directory is reachable from the web (the document root symlinks to it, so
   * the web server can serve a hit without waking Node) while the metadata
   * must not be. Keeping the sidecar in a sibling tree means confidentiality
   * rests on the filesystem layout rather than on an Apache rewrite rule
   * somebody could reorder.
   */
  meta: string;
  /** The normalised request path this entry answers, e.g. `/preise`. */
  path: string;
}

/**
 * Characters a path segment may never contain: the path separators, the
 * Windows-reserved set, and everything below `0x20`.
 *
 * Spelled out as a list of code points rather than a regular expression on
 * purpose. The obvious shorthand for "control characters" is a range, and the
 * two obvious ranges are both wrong in ways nothing catches: `" -/"` spans
 * `0x20`-`0x2F` and so rejects the hyphen and the dot — every slug and every
 * file extension — while an escaped `\x00-\x1f` is exactly the kind of literal
 * that gets mangled on its way through a shell heredoc into this file.
 */
const FORBIDDEN = new Set(['/', '\\', ':', '*', '?', '"', '<', '>', '|']);

function isSafeSegment(segment: string): boolean {
  if (segment === "" || segment === "." || segment === "..") return false;
  // The metadata lives under `.meta/`; a request for `/.meta/anything` must
  // not be able to read it back or write over it.
  if (segment.startsWith(".")) return false;

  for (const ch of segment) {
    if (FORBIDDEN.has(ch)) return false;
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

/** True for a final segment that already names a file type (`rss.xml`). */
function hasExtension(segment: string): boolean {
  const dot = segment.lastIndexOf(".");
  if (dot <= 0 || dot === segment.length - 1) return false;
  const ext = segment.slice(dot + 1);
  for (const ch of ext) {
    const isDigit = ch >= "0" && ch <= "9";
    const isLower = ch >= "a" && ch <= "z";
    const isUpper = ch >= "A" && ch <= "Z";
    if (!isDigit && !isLower && !isUpper) return false;
  }
  return true;
}

/**
 * Normalise a pathname into a cache location, or `null` when it must not be
 * cached at all.
 *
 * Deliberate decisions:
 *
 * - **The query string is dropped entirely.** None of the three public sites
 *   reads `Astro.url.searchParams` server-side, so a query cannot change the
 *   rendered page — but it *can* be appended by anyone. Keying on it would let
 *   `?1`, `?2`, `?3` … fill the disk with identical copies and turn every
 *   visit into a fresh render. If a route ever does read a parameter, it must
 *   opt out of caching explicitly rather than this rule being loosened.
 * - **A trailing slash is stripped** (except at the root), matching the sites'
 *   `trailingSlash: "ignore"` and `build.format: "directory"`.
 * - **A final segment carrying an extension is stored verbatim** (`rss.xml`,
 *   `sitemap.xml`), so the web server picks the content type from the name.
 *   Everything else becomes `<path>/index.html` — exactly what the static
 *   build produced, and what `DirectoryIndex` already serves.
 *
 * The input is the pathname only; decoding happens here, before validation,
 * because `%2e%2e` is `..` by the time the filesystem sees it and checking the
 * encoded form checks the wrong string.
 */
export function cacheLocation(pathname: string): CacheLocation | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // A malformed escape is not a page anybody has.
    return null;
  }

  const segments = decoded.split("/").filter((s) => s !== "");
  if (!segments.every(isSafeSegment)) return null;

  if (segments.length === 0) {
    return { file: "index.html", meta: "index.json", path: "/" };
  }

  const joined = segments.join("/");
  const last = segments[segments.length - 1] as string;

  return {
    file: hasExtension(last) ? joined : joined + "/index.html",
    meta: joined + ".json",
    path: "/" + joined,
  };
}

/**
 * Whether a request may be answered from, or written to, the cache at all.
 *
 * `HEAD` is included on purpose: it renders the same page, and a warm `HEAD`
 * is the cheapest way for the rebuild endpoint to verify an entry exists.
 * Everything else — POST, PUT, the whole control plane — never touches the
 * store.
 */
export function isCacheableMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === "GET" || m === "HEAD";
}

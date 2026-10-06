/**
 * The two serialisations every public site hand-rolled: sitemap XML and
 * JSON-LD. Small, and exactly the kind of code where one copy forgets a case —
 * the shop's sitemap escape did not escape `"`, and three sites inlined
 * `JSON.stringify` into a `<script>` without escaping `</`.
 */

/** Escape text for an XML element or a double-quoted attribute. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * A sitemap index naming `sitemaps` (absolute URLs).
 *
 * `lastmod` is optional and should be a REAL date — omit it rather than stamp
 * the render or build date, which tells a crawler everything changed.
 */
export function renderSitemapIndex(sitemaps: readonly string[], lastmod?: string): string {
  const items = sitemaps
    .map(
      (loc) =>
        `<sitemap><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ""}</sitemap>`,
    )
    .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    items +
    "</sitemapindex>"
  );
}

/** One entry of a sectioned sitemap index: a child sitemap and its own date. */
export interface SitemapIndexEntry {
  loc: string;
  /** `YYYY-MM-DD` of the newest URL inside that child; omitted when unknown. */
  lastmod?: string;
}

/**
 * A sitemap index whose children each carry THEIR OWN `lastmod`.
 *
 * The structure every public site uses since 2026-10-06: one child per kind of
 * page (`sitemap-pages.xml`, `sitemap-posts.xml`, `sitemap-tools.xml`, …), so a
 * crawler re-reads only the section that moved and Search Console reports
 * coverage per section. Empty sections are dropped — a child with no `<url>`
 * is reported as an error.
 */
export function renderSectionedSitemapIndex(entries: readonly SitemapIndexEntry[]): string {
  const items = entries
    .map(
      (e) =>
        `<sitemap><loc>${escapeXml(e.loc)}</loc>${e.lastmod ? `<lastmod>${escapeXml(e.lastmod)}</lastmod>` : ""}</sitemap>`,
    )
    .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    items +
    "</sitemapindex>"
  );
}

/** Newest `YYYY-MM-DD` among `dates`, ignoring anything that is not a date. */
export function newestDay(dates: ReadonlyArray<string | null | undefined>): string | undefined {
  let newest: string | undefined;
  for (const raw of dates) {
    const day = (raw ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!newest || day > newest) newest = day;
  }
  return newest;
}

/**
 * JSON-LD for an inline `<script type="application/ld+json">`.
 *
 * `<` becomes `<`, so a `</script>` inside panel-authored text cannot end
 * the element early; U+2028/U+2029 are escaped because older parsers treat them
 * as line terminators inside a script. The result is still the same JSON.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

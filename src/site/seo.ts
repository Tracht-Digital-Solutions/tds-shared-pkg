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

/** One `<url>` of a sitemap, every URL already absolute. */
export interface SitemapUrlXml {
  loc: string;
  /** German and English URLs of the same page; x-default points at the German one. */
  alternates?: { de: string; en: string };
  image?: { loc: string; title: string };
  /** `YYYY-MM-DD`; omitted rather than invented. */
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

/** One `<url>` element in the compact form every site emits. */
export function renderSitemapUrl(url: SitemapUrlXml): string {
  const alternates = url.alternates
    ? `<xhtml:link rel="alternate" hreflang="de-DE" href="${escapeXml(url.alternates.de)}"/>` +
      `<xhtml:link rel="alternate" hreflang="en-GB" href="${escapeXml(url.alternates.en)}"/>` +
      `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(url.alternates.de)}"/>`
    : "";
  const image = url.image
    ? `<image:image><image:loc>${escapeXml(url.image.loc)}</image:loc>` +
      `<image:title>${escapeXml(url.image.title)}</image:title></image:image>`
    : "";
  return (
    "<url>" +
    `<loc>${escapeXml(url.loc)}</loc>` +
    alternates +
    image +
    (url.lastmod ? `<lastmod>${escapeXml(url.lastmod)}</lastmod>` : "") +
    (url.changefreq ? `<changefreq>${escapeXml(url.changefreq)}</changefreq>` : "") +
    (url.priority !== undefined ? `<priority>${url.priority.toFixed(1)}</priority>` : "") +
    "</url>"
  );
}

/**
 * A `<urlset>` with the xhtml (hreflang) and image namespaces.
 * Promoted in 0.59 from the landing page, journal and tools sitemaps.
 */
export function renderUrlset(urls: readonly SitemapUrlXml[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
    'xmlns:xhtml="http://www.w3.org/1999/xhtml" ' +
    'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' +
    urls.map(renderSitemapUrl).join("") +
    "</urlset>"
  );
}

/**
 * The sections of a sectioned sitemap: one child per kind of page,
 * `/sitemap-<section>.xml`, plus the index and the legacy `/sitemap-0.xml`
 * the page cache must rebuild. Each site names its own sections.
 */
export function defineSitemapSections<const S extends string>(sections: readonly S[]) {
  const sectionPath = (section: S): string => `/sitemap-${section}.xml`;
  return {
    sections,
    isSection: (value: string | undefined): value is S => (sections as readonly string[]).includes(value ?? ""),
    sectionPath,
    paths: ["/sitemap-index.xml", "/sitemap-0.xml", ...sections.map(sectionPath)] as readonly string[],
  };
}

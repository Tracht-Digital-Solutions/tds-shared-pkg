import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createImageCatalog,
  createSitemapExclusions,
  defineSitemapSections,
  groupExcluded,
  matchesPattern,
  renderUrlset,
} from "../site";
import { localizedPath, neutralPath, OG_LOCALE } from "../i18n";
import { LEGAL_LINKS } from "../nav";

describe("sitemap exclusions", () => {
  it("matches exact paths and trailing-* prefixes, slash-insensitive", () => {
    expect(matchesPattern("/a/", "/a")).toBe(true);
    expect(matchesPattern("/a/b", "/a/*")).toBe(true);
    expect(matchesPattern("/ab", "/a")).toBe(false);
    expect(matchesPattern("/x", " ")).toBe(false);
    expect(groupExcluded(["/x", "/en/x"], ["/en/x"])).toBe(true);
  });

  it("loads per site, excludes the whole language group and fails soft", async () => {
    const read = vi.fn().mockResolvedValue({ paths: ["/en/tools/a", 3, ""] });
    const memo = vi.fn(async (_k: string, load: () => Promise<string[]>) => load());
    const ex = createSitemapExclusions({
      siteId: "tools",
      contentBase: () => "https://api.example/content",
      read,
      memo,
      hreflangGroup: (p) => [neutralPath(p), localizedPath(p, "en")],
    });
    expect(await ex.exclusionPatterns()).toEqual(["/en/tools/a"]);
    expect(read.mock.calls[0]![0]).toBe("https://api.example/content/sitemap-exclusions?site=tools");
    expect(await ex.isExcluded("/tools/a")).toBe(true);
    expect(await ex.isExcluded("/tools/b")).toBe(false);

    const off = createSitemapExclusions({ siteId: "x", contentBase: () => "https://a", read, memo, disabled: true });
    expect(await off.exclusionPatterns()).toEqual([]);
  });
});

describe("sitemap rendering", () => {
  it("renders the compact urlset with alternates, image and dates", () => {
    const xml = renderUrlset([
      {
        loc: "https://s/x",
        alternates: { de: "https://s/x", en: "https://s/en/x" },
        image: { loc: "https://s/i.webp", title: "A & B" },
        lastmod: "2026-10-01",
        changefreq: "weekly",
        priority: 0.8,
      },
      { loc: "https://s/y" },
    ]);
    expect(xml).toContain(
      '<url><loc>https://s/x</loc><xhtml:link rel="alternate" hreflang="de-DE" href="https://s/x"/>' +
        '<xhtml:link rel="alternate" hreflang="en-GB" href="https://s/en/x"/>' +
        '<xhtml:link rel="alternate" hreflang="x-default" href="https://s/x"/>' +
        "<image:image><image:loc>https://s/i.webp</image:loc><image:title>A &amp; B</image:title></image:image>" +
        "<lastmod>2026-10-01</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>",
    );
    expect(xml).toContain("<url><loc>https://s/y</loc></url>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><urlset')).toBe(true);
  });

  it("defines a site's sections and the paths the cache rebuilds", () => {
    const s = defineSitemapSections(["pages", "tools"] as const);
    expect(s.sectionPath("tools")).toBe("/sitemap-tools.xml");
    expect(s.isSection("tools")).toBe(true);
    expect(s.isSection("posts")).toBe(false);
    expect(s.paths).toEqual(["/sitemap-index.xml", "/sitemap-0.xml", "/sitemap-pages.xml", "/sitemap-tools.xml"]);
  });
});

describe("image catalogue", () => {
  const raw = {
    a: {
      src: "/img/a.webp",
      width: 1600,
      height: 900,
      alt: { de: "Bild", en: "Picture" },
      variants: [{ src: "/img/a-800.webp", width: 800, height: 450, hash: "h1", bytes: 1 }],
      digitalSourceType: "x",
    },
  };

  it("finds an asset by its own or a variant's URL, on its origin only", () => {
    const c = createImageCatalog(raw, { origin: "https://s" });
    expect(c.imageInfo("/img/a-800.webp")?.src).toBe("/img/a.webp");
    expect(c.imageInfo("https://other/img/a.webp")).toBeUndefined();
    expect(c.imageHints("/img/a.webp", "en")?.srcSet).toBe("https://s/img/a-800.webp?v=h1 800w");
    expect(c.imageObject("/img/a.webp", "de", "https://s/p")?.about).toEqual({ "@id": "https://s/p#webpage" });
    expect(createImageCatalog(raw, { origin: "https://s", about: "page" }).imageObject("/img/a.webp", "de", "https://s/p")?.about).toEqual({
      "@id": "https://s/p",
    });
  });
});

describe("language paths and legal links", () => {
  it("maps between the trees by prefix", () => {
    expect(neutralPath("/en/tools/x")).toBe("/tools/x");
    expect(neutralPath("/en")).toBe("/");
    expect(neutralPath("/english")).toBe("/english");
    expect(localizedPath("/", "en")).toBe("/en/");
    expect(localizedPath("/en/x", "de")).toBe("/x");
    expect(OG_LOCALE.en).toBe("en_GB");
    expect(LEGAL_LINKS.imprint).toBe("https://tracht-digital.de/legal/impressum");
  });
});

describe("shipped scripts", () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8"));

  it("exposes the consumer scripts as bins inside the published files", () => {
    expect(pkg.bin).toEqual({ "tds-lint-primitives": "scripts/lint-primitives.mjs", "tds-geo-audit": "scripts/geo-audit.mjs" });
    expect(pkg.files).toContain("scripts");
    for (const file of Object.values(pkg.bin) as string[]) {
      expect(readFileSync(join(__dirname, "../..", file), "utf8").startsWith("#!/usr/bin/env node")).toBe(true);
    }
  });

  it("geo-audit keeps every universal check", () => {
    const script = readFileSync(join(__dirname, "../../scripts/geo-audit.mjs"), "utf8");
    const ids = [...(/const CHECK_IDS = \[([\s\S]*?)\];/.exec(script)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual([
      "robots.agents",
      "robots.disallow",
      "robots.sitemap",
      "sitemap.index",
      "sitemap.pages",
      "page.status",
      "page.noindex",
      "page.lang",
      "title.present",
      "title.length",
      "title.distinct",
      "description.present",
      "description.length",
      "description.distinct",
      "heading.single-h1",
      "heading.levels",
      "canonical.self",
      "hreflang.present",
      "hreflang.reciprocal",
      "og.title-description",
      "og.image",
      "og.image-answers",
      "jsonld.parses",
      "jsonld.required-types",
      "jsonld.forbidden-types",
      "jsonld.id-unique",
      "jsonld.id-resolves",
      "jsonld.date-visible",
      "img.alt",
      "link.internal-resolves",
      "text.banned-words",
      "text.word-count",
      "llms.status",
      "llms.type",
      "llms.budget",
      "llms.covers-sitemap",
    ]);
    expect(script).toContain('"scripts/geo-audit.profile.mjs"');
  });
});

#!/usr/bin/env node
/**
 * Search and answer-engine audit for a public site — what a crawler reads.
 *
 *   npm run audit:geo -- http://127.0.0.1:4411
 *   tds-geo-audit [base] [--profile scripts/geo-audit.profile.mjs]
 *
 * Deliberately NO browser. Search engines render JavaScript late and many AI
 * crawlers not at all, so every check here runs against the raw server HTML a
 * plain request returns. What only a browser can see (overflow, focus, axe)
 * is each site's `ux-audit.mjs`.
 *
 * It starts from `robots.txt` and the sitemap, exactly like a crawler, and for
 * every listed URL checks the list in `CHECK_IDS` below.
 *
 * Exit code 1 on a hard failure; warnings are printed for judgement.
 *
 * It only loads the site it is pointed at — never point it at an API, and
 * never at production from a development machine.
 *
 * ── One script, four profiles (tds-shared 0.58) ───────────────────────────
 * The landing page, journal, tools site and shop each kept a byte-identical
 * copy of this file with only `PROFILE` differing, plus a test per repo to
 * keep the copies' check lists in step. The body now ships here; each site
 * keeps only its profile as `scripts/geo-audit.profile.mjs` (default export).
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const profileFlag = process.argv.indexOf("--profile");
const profilePath = resolve(
  process.cwd(),
  profileFlag > -1 ? process.argv[profileFlag + 1] : "scripts/geo-audit.profile.mjs",
);
const PROFILE = (await import(pathToFileURL(profilePath).href)).default;


/**
 * Every universal check, by id. `src/__tests__/geoAudit.test.ts` pins this
 * list, so dropping a check is a test failure rather than a quiet loss of
 * coverage on all four sites at once.
 */
const CHECK_IDS = [
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
];

// ── generic body — identical in all four repos ────────────────────────────
const args = process.argv.slice(2).filter((arg, i, all) => arg !== "--profile" && all[i - 1] !== "--profile");
const base = (args.find((arg) => !arg.startsWith("--")) ?? PROFILE.defaultBase).replace(/\/$/, "");
const SITE = PROFILE.site;

const failures = [];
const warnings = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);

const toLocal = (url) => url.replace(SITE, base);
const pathOf = (url) => new URL(url, SITE).pathname;
const skipped = (path) => PROFILE.skipPaths.some((prefix) => path.startsWith(prefix));

const decode = (value) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

/** Attributes of one tag as a plain object. */
function attrs(tag) {
  const out = {};
  for (const match of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g)) {
    out[match[1].toLowerCase()] = decode(match[2]);
  }
  return out;
}

const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => attrs(m[0]));
const text = (fragment) => decode(fragment.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

async function get(url, { redirect = "manual" } = {}) {
  const res = await fetch(url, { redirect, headers: { "User-Agent": "tds-geo-audit" } });
  return res;
}

// ── robots.txt ────────────────────────────────────────────────────────────
{
  const res = await get(`${base}/robots.txt`);
  if (res.status !== 200) {
    fail("robots.txt", `status ${res.status}`);
  } else {
    const body = await res.text();
    const groups = new Map();
    let current = [];
    let lastWasAgent = false;
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, "").trim();
      if (!line) continue;
      const [key, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      if (/^user-agent$/i.test(key)) {
        if (!lastWasAgent) current = [];
        current.push(value);
        groups.set(value, groups.get(value) ?? []);
        lastWasAgent = true;
        continue;
      }
      lastWasAgent = false;
      for (const agent of current) groups.get(agent).push(`${key.toLowerCase()}:${value}`);
    }
    for (const agent of PROFILE.agents) {
      const rules = groups.get(agent);
      if (!rules) {
        fail("robots.txt", `no group for ${agent}`);
        continue;
      }
      if (rules.includes("disallow:/")) fail("robots.txt", `${agent} is shut out of the whole site`);
      for (const path of PROFILE.requiredDisallow) {
        if (!rules.includes(`disallow:${path}`)) fail("robots.txt", `${agent} may crawl ${path}`);
      }
    }
    const sitemapLine = new RegExp(`^Sitemap:\\s*${SITE}${PROFILE.sitemapIndexPath}`, "im");
    if (!sitemapLine.test(body)) fail("robots.txt", "does not advertise the sitemap index");
  }
}

// ── sitemap ───────────────────────────────────────────────────────────────
const indexRes = await get(`${base}${PROFILE.sitemapIndexPath}`);
if (indexRes.status !== 200) {
  console.error(`${PROFILE.sitemapIndexPath} answered ${indexRes.status} — nothing to audit.`);
  process.exit(1);
}
const sitemapUrls = [...(await indexRes.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const pageUrls = [];
for (const sitemapUrl of sitemapUrls) {
  const res = await get(toLocal(sitemapUrl));
  if (res.status !== 200) {
    fail(sitemapUrl, `status ${res.status}`);
    continue;
  }
  pageUrls.push(...[...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
}
if (pageUrls.length === 0) fail("sitemap", "lists no page");

// ── pages ─────────────────────────────────────────────────────────────────
const pages = new Map();
const internalLinks = new Map(); // path -> first page linking to it
const imageUrls = new Set();

for (const url of pageUrls) {
  const path = pathOf(url);
  const res = await get(toLocal(url));
  if (res.status !== 200) {
    fail(path, `status ${res.status} for a URL listed in the sitemap`);
    continue;
  }
  const html = await res.text();
  const head = html.slice(0, html.indexOf("</head>") + 7);
  const metas = tags(head, "meta");
  const links = tags(head, "link");
  const meta = (key, value) => metas.find((m) => m[key] === value)?.content;

  const title = text(head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = meta("name", "description") ?? "";
  const robots = meta("name", "robots") ?? "";
  const canonical = links.find((l) => l.rel === "canonical")?.href ?? "";
  const alternates = Object.fromEntries(
    links.filter((l) => l.rel === "alternate" && l.hreflang).map((l) => [l.hreflang, l.href]),
  );
  const lang = attrs(html.match(/<html\b[^>]*>/i)?.[0] ?? "").lang ?? "";

  if (!lang) fail(path, "html has no lang");
  if (/noindex/i.test(robots)) fail(path, "listed in the sitemap but served noindex");

  // An over-long title is a hard failure only where titles are code-owned.
  // On a site whose headlines come from an editor the fix is editorial, not a
  // deploy — and `pageTitle` there deliberately keeps a long headline whole
  // rather than truncating it. Reporting it is right; failing the build on
  // somebody else.s sentence is not.
  if (!title) fail(path, "no <title>");
  else if (title.length > PROFILE.titleMax) {
    const say = PROFILE.titleMaxHard === false ? warn : fail;
    say(path, `title is ${title.length} characters: ${title}`);
  }
  const [descMin, descMax] = PROFILE.descriptionRange;
  if (!description) fail(path, "no meta description");
  else if (description.length < descMin || description.length > descMax) {
    fail(path, `description is ${description.length} characters: ${description}`);
  }

  const expectedCanonical = new URL(path, SITE).href;
  if (canonical !== expectedCanonical) fail(path, `canonical is ${canonical || "missing"}`);
  // A missing alternate is a FAILURE only where every indexable page is
  // guaranteed a twin. On a journal a tag can exist in one language and not
  // the other, and on a shop a product may be published in one tree only —
  // there the honest answer is no hreflang, not a link to a 404, so the
  // absence is a warning and the RECIPROCITY check below is what catches real
  // breakage.
  for (const key of [...PROFILE.langs, "x-default"]) {
    if (alternates[key]) continue;
    if (PROFILE.hreflangRequired === false) warn(path, `no hreflang ${key}`);
    else fail(path, `no hreflang ${key}`);
  }

  const ogImage = meta("property", "og:image");
  if (!meta("property", "og:title") || !meta("property", "og:description")) {
    fail(path, "Open Graph title or description missing");
  }
  if (!ogImage) fail(path, "no og:image");
  else imageUrls.add(ogImage);

  // Headings
  const body = html.slice(html.indexOf("<body"));
  const headings = [...body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({
    level: Number(m[1]),
    text: text(m[2]),
  }));
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length !== 1) fail(path, `${h1s.length} <h1> elements`);

  // The repository holds the banned words; this catches what only the
  // rendered page shows — a panel override, a synced demo description.
  // Scripts, styles and comments are cut first; they are not visible text.
  const visible = text(
    body
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " "),
  );
  const banned = visible.match(PROFILE.bannedWords);
  if (banned) fail(path, `banned word "${banned[0]}" in the visible text`);
  for (let i = 1; i < headings.length; i += 1) {
    if (headings[i].level > headings[i - 1].level + 1) {
      warn(
        path,
        `heading skips from h${headings[i - 1].level} to h${headings[i].level} ("${headings[i].text.slice(0, 50)}")`,
      );
    }
  }

  // ── structured data ─────────────────────────────────────────────────────
  const types = new Set();
  const nodes = [];
  const declaredIds = new Map(); // @id -> types
  const references = []; // { id, from }
  // The node that REPRESENTS the page. On an article that is the posting
  // itself, not the bare `mainEntityOfPage` stub beside it — the stub carries
  // no date, so looking only for `WebPage` would report every article as
  // undated.
  const PAGE_TYPES = [
    "WebPage",
    "ProfilePage",
    "CollectionPage",
    "AboutPage",
    "ItemPage",
    "ContactPage",
    "FAQPage",
    "BlogPosting",
    "Article",
    "NewsArticle",
    "TechArticle",
  ];

  for (const match of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]);
      const walk = (node, owner) => {
        if (Array.isArray(node)) return node.forEach((item) => walk(item, owner));
        if (!node || typeof node !== "object") return;
        if (node["@graph"]) walk(node["@graph"], owner);
        const type = node["@type"];
        const id = node["@id"];
        if (type) {
          nodes.push(node);
          for (const t of [].concat(type)) types.add(t);
          if (id) {
            const previous = declaredIds.get(id);
            const own = [].concat(type).join(",");
            if (previous && previous !== own) fail(path, `@id ${id} is declared as both ${previous} and ${own}`);
            declaredIds.set(id, own);
          }
        } else if (id) {
          // No `@type`: this is a reference to an entity described elsewhere.
          references.push({ id, from: owner });
        }
        for (const [key, value] of Object.entries(node)) {
          if (key.startsWith("@")) continue;
          if (PROFILE.forbiddenProps.includes(key)) fail(path, `JSON-LD carries ${key}, which this site refuses`);
          walk(value, [].concat(type ?? owner ?? "graph").join(","));
        }
      };
      walk(data, null);
    } catch (error) {
      fail(path, `JSON-LD does not parse: ${error.message}`);
    }
  }

  const kind = PROFILE.pageKind(path);
  // A requirement is one type, or an array meaning "any of these" — a tool
  // page may declare `WebApplication` or `SoftwareApplication` depending on
  // what its pack's manifest asked for, and either is correct.
  for (const requirement of kind.requiredTypes) {
    const options = [].concat(requirement);
    if (!options.some((type) => types.has(type))) fail(path, `JSON-LD lacks ${options.join(" or ")}`);
  }
  for (const type of PROFILE.forbiddenTypes) {
    if (types.has(type)) fail(path, `JSON-LD carries ${type}, which this site refuses`);
  }
  for (const { id, from } of references) {
    if (declaredIds.has(id) || PROFILE.entityAnchors.includes(id)) continue;
    warn(path, `${from ?? "a node"} references @id ${id}, which nothing on the page declares`);
  }

  // A date in the markup has to be a date on the page. Structured data that
  // says more than the page is exactly what engines are told to distrust.
  const pageNode =
    nodes.find((n) => [].concat(n["@type"]).some((t) => PAGE_TYPES.includes(t)) && n.dateModified) ??
    nodes.find((n) => [].concat(n["@type"]).some((t) => PAGE_TYPES.includes(t)));
  if (pageNode?.dateModified) {
    if (!html.includes(`datetime="${pageNode.dateModified}"`)) {
      fail(path, `dateModified ${pageNode.dateModified} is not shown as a <time> on the page`);
    }
  } else if (kind.requireDate) {
    fail(path, `${kind.kind} page without dateModified`);
  }

  if (kind.detailChecks) {
    if (!/class="lead\b/.test(body)) fail(path, "no lead paragraph under the headline");
    if (!/href="(\/en)?\/#about"/.test(body)) fail(path, "no byline linking to the person behind the page");
    if (/<table\b/.test(body)) {
      const outside = [...body.matchAll(/<a\b[^>]*href="(https:\/\/[^"]+)"/g)]
        .map((m) => m[1])
        .filter((href) => !href.includes(new URL(SITE).host.replace(/^www\./, "")));
      if (outside.length === 0) fail(path, "a decision table without an outside source");
    }
  }

  // Images
  for (const img of tags(body, "img")) {
    if (!("alt" in img)) fail(path, `<img src="${img.src}"> has no alt attribute`);
  }

  // Internal links
  for (const a of tags(body, "a")) {
    const href = a.href;
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/.test(href)) continue;
    let target;
    try {
      target = new URL(href, new URL(path, SITE));
    } catch {
      fail(path, `unparsable link ${href}`);
      continue;
    }
    if (target.origin !== SITE) continue;
    if (skipped(target.pathname)) continue;
    if (!internalLinks.has(target.pathname)) internalLinks.set(target.pathname, path);
  }

  const words = text(body.slice(body.indexOf("<main"), body.indexOf("</main>"))).split(" ").length;
  if (words < PROFILE.minWords) warn(path, `only ${words} words in <main>`);

  pages.set(path, { title, description, alternates, words });
}

// ── across pages ──────────────────────────────────────────────────────────
const seen = (key) => {
  const map = new Map();
  for (const [path, page] of pages) {
    const value = page[key];
    if (!value) continue;
    if (map.has(value)) fail(path, `same ${key} as ${map.get(value)}`);
    else map.set(value, path);
  }
};
seen("title");
seen("description");

for (const [path, page] of pages) {
  for (const key of PROFILE.langs) {
    const twinPath = page.alternates[key] ? pathOf(page.alternates[key]) : null;
    if (!twinPath) continue;
    const twin = pages.get(twinPath);
    if (!twin) {
      fail(path, `hreflang ${key} points at ${twinPath}, which the sitemap does not list`);
      continue;
    }
    for (const k of [...PROFILE.langs, "x-default"]) {
      if (twin.alternates[k] !== page.alternates[k]) {
        fail(path, `hreflang ${k} is not reciprocal with ${twinPath}`);
      }
    }
  }
}

for (const [linkPath, from] of internalLinks) {
  const res = await get(`${base}${linkPath}`);
  if (res.status >= 400) fail(from, `links to ${linkPath}, which answers ${res.status}`);
  else if (res.status >= 300) warn(from, `links to ${linkPath}, a redirect to ${res.headers.get("location")}`);
}

for (const image of imageUrls) {
  const res = await get(toLocal(image));
  const type = res.headers.get("content-type") ?? "";
  if (res.status !== 200 || !type.startsWith("image/")) fail(pathOf(image), `og:image answers ${res.status} ${type}`);
}

// ── llms.txt ──────────────────────────────────────────────────────────────
{
  const res = await get(`${base}/llms.txt`);
  if (res.status !== 200) {
    fail("llms.txt", `status ${res.status}`);
  } else {
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("text/plain")) fail("llms.txt", `content-type is ${type || "absent"}`);
    const body = await res.text();
    const bytes = Buffer.byteLength(body, "utf8");
    if (bytes > PROFILE.llmsBudgetBytes) {
      fail("llms.txt", `${bytes} bytes is over the ${PROFILE.llmsBudgetBytes}-byte budget`);
    }
    // Which sitemap URLs the file has to name. Everything, unless a site
    // says otherwise: a journal indexes its ARTICLES, and listing two dozen
    // tag pages beside them would bury the content under its own taxonomy.
    for (const url of pageUrls) {
      if (PROFILE.llmsCovers && !PROFILE.llmsCovers(pathOf(url))) continue;
      if (!body.includes(url)) fail("llms.txt", `does not name ${url}`);
    }
  }
}

// ── report ────────────────────────────────────────────────────────────────
console.log(
  `Audited ${pages.size} pages, ${internalLinks.size} internal link targets, ${imageUrls.size} social images, ` +
    `${CHECK_IDS.length + PROFILE.extraCheckIds.length} checks.`,
);
for (const [path, page] of pages) {
  console.log(`  ${path}  (${page.title.length}/${page.description.length} chars, ${page.words} words)`);
}
if (warnings.length > 0) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const message of warnings) console.log(`  · ${message}`);
}
if (failures.length > 0) {
  console.log(`\nFailures (${failures.length}):`);
  for (const message of failures) console.log(`  ✗ ${message}`);
  process.exit(1);
}
console.log("\nNo hard failures.");

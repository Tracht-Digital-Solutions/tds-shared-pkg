import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cacheLocation, isCacheableMethod } from "./key.js";
import { forLanguages, resolveEvents, type EventMap } from "./events.js";
import { createGenerationCache } from "./memo.js";
import { PageCacheStore, tokenMatches } from "./store.js";

describe("cacheLocation", () => {
  it("maps the root to a bare index.html", () => {
    expect(cacheLocation("/")).toEqual({
      file: "index.html",
      meta: "index.json",
      path: "/",
    });
  });

  it("mirrors the static build's directory format", () => {
    expect(cacheLocation("/preise")?.file).toBe("preise/index.html");
    expect(cacheLocation("/en/tools/qr-code-generator")?.file).toBe(
      "en/tools/qr-code-generator/index.html",
    );
  });

  it("stores a path that already names a file type verbatim", () => {
    // Otherwise the web server would serve `rss.xml/index.html` as HTML and
    // the feed would render as a broken page in every reader.
    expect(cacheLocation("/rss.xml")?.file).toBe("rss.xml");
    expect(cacheLocation("/sitemap.xml")?.file).toBe("sitemap.xml");
  });

  it("treats a trailing slash as the same page", () => {
    expect(cacheLocation("/preise/")?.file).toBe(cacheLocation("/preise")?.file);
  });

  it("refuses to climb out of the cache directory", () => {
    expect(cacheLocation("/../../etc/passwd")).toBeNull();
    // Percent-encoded, because validating before decoding validates the wrong
    // string and this is the form an attacker actually sends.
    expect(cacheLocation("/%2e%2e/%2e%2e/etc/passwd")).toBeNull();
  });

  it("refuses to touch the metadata store through a URL", () => {
    expect(cacheLocation("/.meta/index.json")).toBeNull();
    expect(cacheLocation("/en/.meta")).toBeNull();
  });

  it("keeps hyphens and dots, which a control-character range would eat", () => {
    // The obvious shorthand for "control characters" spans 0x20-0x2F and would
    // reject every slug in the corpus. Pinned because the symptom would be an
    // uncacheable site, not an error.
    expect(cacheLocation("/mein-artikel-2026")?.file).toBe("mein-artikel-2026/index.html");
  });

  it("rejects a malformed escape rather than throwing", () => {
    expect(cacheLocation("/%zz")).toBeNull();
  });
});

describe("isCacheableMethod", () => {
  it("covers GET and HEAD only", () => {
    expect(isCacheableMethod("get")).toBe(true);
    expect(isCacheableMethod("HEAD")).toBe(true);
    expect(isCacheableMethod("POST")).toBe(false);
    expect(isCacheableMethod("PURGE")).toBe(false);
  });
});

describe("resolveEvents", () => {
  const map: EventMap = {
    post: (e) => forLanguages(e, (lang) => (lang === "de" ? [`/${e.id}`, "/"] : [`/en/${e.id}`, "/en/"])),
    tool: (e) => forLanguages(e, (lang) => (lang === "de" ? [`/tools/${e.id}`] : [`/en/tools/${e.id}`])),
  };

  it("expands one event into every page it dates", () => {
    expect(resolveEvents(map, [{ type: "post", id: "hallo", lang: "de" }]).paths).toEqual([
      "/",
      "/hallo",
    ]);
  });

  it("covers both language trees when the event names no language", () => {
    // A tool switched off disappears from the German and the English catalog
    // at the same moment; a language-less event must not rebuild only one.
    expect(resolveEvents(map, [{ type: "tool", id: "qr" }]).paths).toEqual([
      "/en/tools/qr",
      "/tools/qr",
    ]);
  });

  it("deduplicates across events and returns a stable order", () => {
    const { paths } = resolveEvents(map, [
      { type: "post", id: "b", lang: "de" },
      { type: "post", id: "a", lang: "de" },
    ]);
    expect(paths).toEqual(["/", "/a", "/b"]);
  });

  it("reports an unknown event type instead of silently rebuilding nothing", () => {
    // A module that starts sending a new type before a site learns it would
    // otherwise get a cheerful 200 and change no page at all.
    const result = resolveEvents(map, [{ type: "widget", id: "x" }]);
    expect(result.paths).toEqual([]);
    expect(result.unknown).toEqual(["widget"]);
  });

  it("drops a resolver's non-absolute output rather than storing it", () => {
    const sloppy: EventMap = { post: () => ["relative/path", "/good"] };
    expect(resolveEvents(sloppy, [{ type: "post" }]).paths).toEqual(["/good"]);
  });
});

describe("createGenerationCache", () => {
  it("memoises within a generation", async () => {
    const cache = createGenerationCache();
    let calls = 0;
    const load = async () => {
      calls += 1;
      return calls;
    };

    expect(await cache.get("blocks:de", load)).toBe(1);
    expect(await cache.get("blocks:de", load)).toBe(1);
    expect(calls).toBe(1);
  });

  it("shares one in-flight load between concurrent callers", async () => {
    const cache = createGenerationCache();
    let calls = 0;
    const load = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 5));
      return "x";
    };

    await Promise.all([cache.get("k", load), cache.get("k", load), cache.get("k", load)]);
    expect(calls).toBe(1);
  });

  it("reads through after invalidate — the whole reason it exists", async () => {
    const cache = createGenerationCache();
    let value = "alt";
    const load = async () => value;

    expect(await cache.get("blocks:de", load)).toBe("alt");
    value = "neu";
    expect(await cache.get("blocks:de", load)).toBe("alt");

    cache.invalidate();
    expect(await cache.get("blocks:de", load)).toBe("neu");
    expect(cache.generation).toBe(1);
  });

  it("does not remember a failure", async () => {
    const cache = createGenerationCache();
    let attempt = 0;
    const load = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("API hiccup");
      return "ok";
    };

    await expect(cache.get("k", load)).rejects.toThrow("API hiccup");
    // A remembered rejection would pin an outage for the life of the process,
    // turning a fail-soft fetch into a permanent one.
    expect(await cache.get("k", load)).toBe("ok");
  });
});

describe("tokenMatches", () => {
  it("accepts the exact token and nothing else", () => {
    expect(tokenMatches("s3cret", "s3cret")).toBe(true);
    expect(tokenMatches("s3cret", "s3cres")).toBe(false);
    expect(tokenMatches("s3cret", "s3cret ")).toBe(false);
  });

  it("treats an unconfigured or absent token as no match", () => {
    expect(tokenMatches("", "")).toBe(false);
    expect(tokenMatches("", "anything")).toBe(false);
    expect(tokenMatches("s3cret", null)).toBe(false);
  });

  it("compares tokens of different lengths without throwing", () => {
    // timingSafeEqual throws on mismatched lengths; hashing first is what
    // keeps a short guess from crashing the endpoint instead of failing it.
    expect(tokenMatches("s3cret", "x")).toBe(false);
  });
});

describe("PageCacheStore", () => {
  let dir: string;
  let store: PageCacheStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "tds-cache-"));
    store = new PageCacheStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a page with its content type", async () => {
    await store.write("/preise", Buffer.from("<html>hi</html>"), "text/html; charset=utf-8");
    const hit = await store.read("/preise");

    expect(hit?.body.toString()).toBe("<html>hi</html>");
    expect(hit?.meta.contentType).toBe("text/html; charset=utf-8");
    expect(hit?.meta.path).toBe("/preise");
  });

  it("writes where the web server can serve it without help", async () => {
    await store.write("/en/preise", Buffer.from("x"), "text/html");
    // The static build produced exactly this layout; the Apache rewrite in
    // each site's .htaccess relies on it.
    expect(await readFile(join(dir, "en", "preise", "index.html"), "utf8")).toBe("x");
  });

  it("replaces an entry in place, so a rebuild swaps rather than empties", async () => {
    await store.write("/", Buffer.from("alt"), "text/html");
    await store.write("/", Buffer.from("neu"), "text/html");
    expect((await store.read("/"))?.body.toString()).toBe("neu");
  });

  it("gives different bytes different etags", async () => {
    const a = await store.write("/a", Buffer.from("one"), "text/html");
    const b = await store.write("/b", Buffer.from("two"), "text/html");
    expect(a?.etag).not.toBe(b?.etag);
  });

  it("reports a miss for a path never written", async () => {
    expect(await store.read("/nope")).toBeNull();
  });

  it("treats a page without its metadata as a miss", async () => {
    await store.write("/x", Buffer.from("x"), "text/html");
    await rm(join(dir, ".meta", "x.json"));
    // Guessing text/html here would serve a cached feed as a broken page.
    expect(await store.read("/x")).toBeNull();
  });

  it("purging twice is not an error", async () => {
    await store.write("/x", Buffer.from("x"), "text/html");
    await store.remove("/x");
    await expect(store.remove("/x")).resolves.toBeUndefined();
  });

  it("lists what it holds, newest first", async () => {
    await store.write("/a", Buffer.from("a"), "text/html");
    await new Promise((r) => setTimeout(r, 5));
    await store.write("/b", Buffer.from("bb"), "text/html");

    const entries = await store.list();
    expect(entries.map((e) => e.path)).toEqual(["/b", "/a"]);
    expect(entries[0]?.bytes).toBe(2);
  });

  it("reports an empty list for a cache that does not exist yet", async () => {
    expect(await new PageCacheStore(join(dir, "nothing-here")).list()).toEqual([]);
  });

  it("refuses to write through a traversing path", async () => {
    expect(await store.write("/../escape", Buffer.from("x"), "text/html")).toBeNull();
  });

  it("keeps metadata out of the served tree when given its own directory", async () => {
    // Production splits them: the pages directory is what the document root
    // symlinks to, so anything beside a rendered page in there is reachable
    // from the web. Confidentiality should rest on the layout, not on an
    // Apache rewrite somebody could reorder.
    const pages = join(dir, "pages");
    const meta = join(dir, "meta");
    const split = new PageCacheStore(pages, meta);

    await split.write("/preise", Buffer.from("x"), "text/html");

    expect(await readFile(join(pages, "preise", "index.html"), "utf8")).toBe("x");
    await expect(readFile(join(meta, "preise.json"), "utf8")).resolves.toContain("/preise");
    expect((await split.read("/preise"))?.body.toString()).toBe("x");
  });

  it("clear() empties the directories but does not remove them", async () => {
    // In production the pages directory IS a symlink the document root owns.
    // Removing it would disconnect the web server from the store until the
    // next restart — every page a miss, and nothing anywhere to say why.
    await store.write("/a", Buffer.from("a"), "text/html");
    await store.clear();

    expect(await store.list()).toEqual([]);
    expect(await store.read("/a")).toBeNull();
    await expect(stat(dir)).resolves.toBeTruthy();
  });
});

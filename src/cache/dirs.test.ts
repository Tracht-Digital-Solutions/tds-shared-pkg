import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BUILD_MARKER_NAME, CACHE_LINK_NAME, resolveCacheDirs } from "./dirs.js";

const LINK_KIND = process.platform === "win32" ? "junction" : "dir";

describe("resolveCacheDirs", () => {
  let root: string;
  const saved = { dir: process.env.TDS_CACHE_DIR, meta: process.env.TDS_CACHE_META_DIR };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "tds-root-"));
    delete process.env.TDS_CACHE_DIR;
    delete process.env.TDS_CACHE_META_DIR;
  });

  afterEach(async () => {
    process.env.TDS_CACHE_DIR = saved.dir;
    process.env.TDS_CACHE_META_DIR = saved.meta;
    if (saved.dir === undefined) delete process.env.TDS_CACHE_DIR;
    if (saved.meta === undefined) delete process.env.TDS_CACHE_META_DIR;
    await rm(root, { recursive: true, force: true });
  });

  it("creates both directories under the app root by default", () => {
    const dirs = resolveCacheDirs({ root, logger: () => {} });

    expect(dirs.dir).toBe(join(root, "var", "page-cache", "pages"));
    expect(dirs.metaDir).toBe(join(root, "var", "page-cache", "meta"));
    expect(existsSync(dirs.dir)).toBe(true);
    expect(existsSync(dirs.metaDir)).toBe(true);
  });

  it("keeps metadata out of the pages tree", () => {
    // The pages directory is web-reachable by construction; a sidecar stored
    // beside a rendered page would be public too.
    const dirs = resolveCacheDirs({ root, logger: () => {} });
    expect(dirs.metaDir.startsWith(dirs.dir)).toBe(false);
  });

  it("honours the host's env overrides", () => {
    const store = join(root, "outside", "pages");
    process.env.TDS_CACHE_DIR = store;
    process.env.TDS_CACHE_META_DIR = join(root, "outside", "meta");

    const dirs = resolveCacheDirs({ root, logger: () => {} });
    expect(dirs.dir).toBe(store);
    expect(existsSync(dirs.dir)).toBe(true);
  });

  it("resolves a relative override against the app root", () => {
    process.env.TDS_CACHE_DIR = "cache/pages";
    expect(resolveCacheDirs({ root, logger: () => {} }).dir).toBe(join(root, "cache", "pages"));
  });

  it("links the store into the document root so the web server can reach it", () => {
    mkdirSync(join(root, "client"), { recursive: true });

    const dirs = resolveCacheDirs({ root, logger: () => {} });
    const link = join(root, "client", CACHE_LINK_NAME);

    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link).replace(/[\\/]$/, "")).toBe(dirs.dir);
  });

  it("skips the link when there is no document root (astro dev)", () => {
    resolveCacheDirs({ root, logger: () => {} });
    expect(existsSync(join(root, "client", CACHE_LINK_NAME))).toBe(false);
  });

  it("replaces a DANGLING link — the state a deploy leaves behind", () => {
    // The whole reason this runs on every boot. `existsSync` follows the link,
    // so a dangling one reports "nothing there" and a naive implementation
    // then fails with EEXIST on the symlink call, forever, with the site
    // serving every request from Node and nothing to say why.
    const client = join(root, "client");
    mkdirSync(client, { recursive: true });
    const gone = join(root, "was-here");
    mkdirSync(gone);
    symlinkSync(gone, join(client, CACHE_LINK_NAME), LINK_KIND);
    rmSync(gone, { recursive: true, force: true });

    const dirs = resolveCacheDirs({ root, logger: () => {} });
    const link = join(client, CACHE_LINK_NAME);

    expect(existsSync(link)).toBe(true);
    expect(readlinkSync(link).replace(/[\\/]$/, "")).toBe(dirs.dir);
  });

  it("leaves a real directory alone — that is the no-symlink fallback", () => {
    const client = join(root, "client");
    mkdirSync(join(client, CACHE_LINK_NAME), { recursive: true });
    writeFileSync(join(client, CACHE_LINK_NAME, "index.html"), "kept");

    resolveCacheDirs({ root, logger: () => {} });

    expect(lstatSync(join(client, CACHE_LINK_NAME)).isDirectory()).toBe(true);
    expect(existsSync(join(client, CACHE_LINK_NAME, "index.html"))).toBe(true);
  });

  it("is idempotent across boots", () => {
    mkdirSync(join(root, "client"), { recursive: true });
    const first = resolveCacheDirs({ root, logger: () => {} });
    expect(() => resolveCacheDirs({ root, logger: () => {} })).not.toThrow();
    expect(readlinkSync(join(root, "client", CACHE_LINK_NAME)).replace(/[\\/]$/, "")).toBe(first.dir);
  });

  it("never throws when the filesystem refuses", () => {
    // A cache that cannot be created means every request renders — which is
    // exactly how the site behaved before the cache existed. Refusing to boot
    // would be a far worse failure.
    const messages: string[] = [];
    const blocked = join(root, "a-file");
    writeFileSync(blocked, "not a directory");
    process.env.TDS_CACHE_DIR = join(blocked, "pages");

    expect(() => resolveCacheDirs({ root, logger: (m) => messages.push(m) })).not.toThrow();
    expect(messages.join(" ")).toContain("[tds-cache]");
  });
});

/**
 * A stored page names its build's assets by content hash, so a cache entry
 * that outlives its build points at URLs the host no longer has — and Apache
 * serves it off disk without the application ever seeing the problem. This is
 * the regression guard for the 2026-08-24 outage where exactly that happened
 * and the landingpage's hero section disappeared.
 */
describe("resolveCacheDirs — cache of another build", () => {
  let root: string;
  const saved = { dir: process.env.TDS_CACHE_DIR, meta: process.env.TDS_CACHE_META_DIR };

  /** Lay out a deployed tree with one page cached and the given asset names. */
  const deploy = (assets: string[]) => {
    const docroot = join(root, "client");
    const astro = join(docroot, "_astro");
    mkdirSync(astro, { recursive: true });
    for (const name of assets) writeFileSync(join(astro, name), "x");
    return { docroot, astro };
  };

  const fillCache = (dirs: { dir: string; metaDir: string }) => {
    mkdirSync(join(dirs.dir, "preise"), { recursive: true });
    writeFileSync(join(dirs.dir, "index.html"), "<html>old</html>");
    writeFileSync(join(dirs.dir, "preise", "index.html"), "<html>old</html>");
    writeFileSync(join(dirs.metaDir, "index.json"), "{}");
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "tds-build-"));
    delete process.env.TDS_CACHE_DIR;
    delete process.env.TDS_CACHE_META_DIR;
  });

  afterEach(async () => {
    process.env.TDS_CACHE_DIR = saved.dir;
    process.env.TDS_CACHE_META_DIR = saved.meta;
    if (saved.dir === undefined) delete process.env.TDS_CACHE_DIR;
    if (saved.meta === undefined) delete process.env.TDS_CACHE_META_DIR;
    await rm(root, { recursive: true, force: true });
  });

  it("records the build it filled the cache under", () => {
    deploy(["Hero.aaaaaaaa.js"]);
    const dirs = resolveCacheDirs({ root, logger: () => {} });
    expect(existsSync(join(dirs.metaDir, BUILD_MARKER_NAME))).toBe(true);
  });

  it("keeps the cache when the same build boots again", () => {
    deploy(["Hero.aaaaaaaa.js", "client.bbbbbbbb.js"]);
    const first = resolveCacheDirs({ root, logger: () => {} });
    fillCache(first);

    resolveCacheDirs({ root, logger: () => {} });

    // A restart is not a deploy: Passenger recycles the process on its own,
    // and clearing there would throw the cache away for nothing.
    expect(existsSync(join(first.dir, "index.html"))).toBe(true);
    expect(existsSync(join(first.metaDir, "index.json"))).toBe(true);
  });

  it("discards the cache when the asset hashes rotated", () => {
    deploy(["Hero.aaaaaaaa.js"]);
    const dirs = resolveCacheDirs({ root, logger: () => {} });
    fillCache(dirs);

    // What a deploy does: same page, new content hash.
    rmSync(join(root, "client", "_astro", "Hero.aaaaaaaa.js"));
    writeFileSync(join(root, "client", "_astro", "Hero.cccccccc.js"), "x");
    resolveCacheDirs({ root, logger: () => {} });

    expect(existsSync(join(dirs.dir, "index.html"))).toBe(false);
    expect(existsSync(join(dirs.dir, "preise", "index.html"))).toBe(false);
    expect(existsSync(join(dirs.metaDir, "index.json"))).toBe(false);
  });

  it("discards a cache of unknown provenance", () => {
    // Every host is in this state the first time this ships — which is
    // precisely the state that needs clearing, so an absent marker cannot be
    // read as "it matches".
    deploy(["Hero.aaaaaaaa.js"]);
    const dirs = resolveCacheDirs({ root, logger: () => {} });
    fillCache(dirs);
    rmSync(join(dirs.metaDir, BUILD_MARKER_NAME));

    resolveCacheDirs({ root, logger: () => {} });
    expect(existsSync(join(dirs.dir, "index.html"))).toBe(false);
  });

  it("empties the directories without removing them", () => {
    // `dir` is what the document root's symlink points at. Removing it would
    // break the link and disconnect the web server from the store.
    deploy(["Hero.aaaaaaaa.js"]);
    const dirs = resolveCacheDirs({ root, logger: () => {} });
    fillCache(dirs);
    rmSync(join(dirs.metaDir, BUILD_MARKER_NAME));

    resolveCacheDirs({ root, logger: () => {} });
    expect(existsSync(dirs.dir)).toBe(true);
    expect(existsSync(dirs.metaDir)).toBe(true);
    expect(lstatSync(join(root, "client", CACHE_LINK_NAME)).isSymbolicLink()).toBe(true);
  });

  it("leaves the cache alone when there is no built asset directory", () => {
    // `astro dev` has no client/ tree, and a differently laid out host is not
    // something to guess about. Neither is a reason to drop somebody's cache.
    const dirs = resolveCacheDirs({ root, logger: () => {} });
    fillCache(dirs);

    resolveCacheDirs({ root, logger: () => {} });
    expect(existsSync(join(dirs.dir, "index.html"))).toBe(true);
    expect(existsSync(join(dirs.metaDir, BUILD_MARKER_NAME))).toBe(false);
  });

  it("does not report the marker as a cache entry", async () => {
    // It lives in the metadata directory, which PageCacheStore.list() walks.
    deploy(["Hero.aaaaaaaa.js"]);
    const dirs = resolveCacheDirs({ root, logger: () => {} });
    const { PageCacheStore } = await import("./store.js");
    expect(await new PageCacheStore(dirs.dir, dirs.metaDir).list()).toEqual([]);
  });
});

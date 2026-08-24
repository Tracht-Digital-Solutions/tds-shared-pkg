/**
 * The on-disk half of the page cache.
 *
 * A stored entry is a plain file the WEB SERVER can serve without waking Node
 * — that is the whole point of the design, and it is why the layout mirrors
 * what the static build used to produce (`preise/index.html`) rather than
 * something opaque like a hashed blob store. A cache hit then costs exactly
 * what the old static site cost.
 *
 * **Node imports live here**, so this module (and everything re-exporting it)
 * must never be pulled into a browser bundle. That is why `tds-shared` exposes
 * the cache under its own entry point and does not re-export it from `./index`.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";

import { cacheLocation } from "./key.js";

/** What we remember about an entry beyond its bytes. */
export interface CacheMeta {
  /** The request path this entry answers. */
  path: string;
  /** Response content type, replayed verbatim on a hit. */
  contentType: string;
  /** ISO timestamp of the render that produced it. */
  renderedAt: string;
  /** Strong-ish validator, so a hit can answer `304`. */
  etag: string;
}

/** One entry, as reported to the admin panel. */
export interface CacheEntry {
  path: string;
  renderedAt: string;
  bytes: number;
}

/** A stored response, ready to be replayed. */
export interface StoredPage {
  body: Buffer;
  meta: CacheMeta;
}

export class PageCacheStore {
  private readonly metaDir: string;

  /**
   * @param dir      Where the served files go. In production this is what the
   *                 document root's `_tds-cache` symlink points at, so the web
   *                 server can answer a hit without waking Node.
   * @param metaDir  Where the sidecars go. Defaults to `<dir>/.meta` for local
   *                 use; production passes a directory OUTSIDE the web tree,
   *                 so nothing but rendered public HTML is ever reachable.
   */
  constructor(
    private readonly dir: string,
    metaDir?: string,
  ) {
    this.metaDir = metaDir ?? join(dir, ".meta");
  }

  /** Absolute path of a page file inside the cache directory. */
  private abs(relative: string): string {
    return join(this.dir, ...relative.split("/"));
  }

  /** Absolute path of a metadata sidecar. */
  private absMeta(relative: string): string {
    return join(this.metaDir, ...relative.split("/"));
  }

  /**
   * Read an entry, or `null` when there is none.
   *
   * Missing metadata is treated as a miss rather than a partially usable
   * entry: without the content type we would have to guess, and guessing
   * `text/html` for a cached `rss.xml` serves a feed the browser renders as a
   * broken page.
   */
  async read(pathname: string): Promise<StoredPage | null> {
    const loc = cacheLocation(pathname);
    if (!loc) return null;

    try {
      const [body, metaRaw] = await Promise.all([
        readFile(this.abs(loc.file)),
        readFile(this.absMeta(loc.meta), "utf8"),
      ]);
      const meta = JSON.parse(metaRaw) as CacheMeta;
      if (typeof meta?.contentType !== "string") return null;
      return { body, meta };
    } catch {
      return null;
    }
  }

  /**
   * Write an entry atomically: a temporary file next to the target, then a
   * `rename` over it.
   *
   * The atomicity is the load-bearing part of "rebuild = render then swap".
   * A plain `writeFile` over a live entry leaves a window in which a visitor
   * reads a half-written document, and a truncated HTML page renders as a
   * blank white screen rather than as an error anyone would notice.
   */
  async write(pathname: string, body: Buffer, contentType: string): Promise<CacheMeta | null> {
    const loc = cacheLocation(pathname);
    if (!loc) return null;

    const meta: CacheMeta = {
      path: loc.path,
      contentType,
      renderedAt: new Date().toISOString(),
      etag: '"' + createHash("sha256").update(body).digest("hex").slice(0, 32) + '"',
    };

    await this.swap(this.abs(loc.file), body);
    await this.swap(this.absMeta(loc.meta), Buffer.from(JSON.stringify(meta), "utf8"));
    return meta;
  }

  private async swap(target: string, body: Buffer): Promise<void> {
    await mkdir(dirname(target), { recursive: true });
    // The suffix carries the pid and a random word so two concurrent renders
    // of the same path cannot clobber each other's temporary file — which
    // would otherwise surface as a rename failing with ENOENT under load.
    const tmp = `${target}.${process.pid}.${Math.random().toString(36).slice(2, 10)}.tmp`;
    await writeFile(tmp, body);
    try {
      await rename(tmp, target);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }

  /** Remove one entry. Missing is success — purging twice is not an error. */
  async remove(pathname: string): Promise<void> {
    const loc = cacheLocation(pathname);
    if (!loc) return;
    await Promise.all([
      rm(this.abs(loc.file), { force: true }),
      rm(this.absMeta(loc.meta), { force: true }),
    ]);
  }

  /**
   * Empty both directories — their CONTENTS, never the directories themselves.
   *
   * Both, not just the pages: metadata left behind would make {@link list}
   * report entries that no longer exist, and a status screen that lies about
   * an empty cache is worse than none.
   *
   * And contents rather than the directory, because in production the pages
   * directory is reached through a symlink the document root owns. `rm -r` on
   * a symlink removes the LINK, so a "clear the cache" click would silently
   * disconnect the web server from the store until the next app restart
   * recreated it — every page a miss, no error anywhere, and nothing in the
   * cache directory to suggest why.
   */
  async clear(): Promise<void> {
    const empty = async (dir: string): Promise<void> => {
      let items: string[];
      try {
        items = await readdir(dir);
      } catch {
        return; // Nothing there is already empty.
      }
      await Promise.all(items.map((name) => rm(join(dir, name), { recursive: true, force: true })));
    };

    await Promise.all([empty(this.dir), empty(this.metaDir)]);
  }

  /**
   * Every entry currently stored, newest first.
   *
   * Derived from the metadata tree rather than the HTML tree, because the
   * metadata file names carry the request path directly and the HTML tree
   * would require re-deriving `/preise` from `preise/index.html`.
   */
  async list(): Promise<CacheEntry[]> {
    const metaRoot = this.metaDir;
    const found: CacheEntry[] = [];

    const walk = async (dir: string): Promise<void> => {
      let items;
      try {
        items = await readdir(dir, { withFileTypes: true });
      } catch {
        return; // No cache yet is an empty cache, not a failure.
      }
      for (const item of items) {
        const full = join(dir, item.name);
        if (item.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!item.name.endsWith(".json")) continue;
        try {
          const meta = JSON.parse(await readFile(full, "utf8")) as CacheMeta;
          const body = await stat(this.abs(cacheLocation(meta.path)?.file ?? ""));
          found.push({ path: meta.path, renderedAt: meta.renderedAt, bytes: body.size });
        } catch {
          // A metadata file without its page is a half-finished write or a
          // hand-deleted file. Skipping it keeps the report honest instead of
          // failing the whole status call over one stale sidecar.
        }
      }
    };

    await walk(metaRoot);
    found.sort((a, b) => (a.renderedAt < b.renderedAt ? 1 : -1));
    return found;
  }

  /** Where this store keeps its files — for the status endpoint and logs. */
  get directory(): string {
    return this.dir.endsWith(sep) ? this.dir.slice(0, -1) : this.dir;
  }
}

/**
 * Constant-time token comparison.
 *
 * The control endpoints sit on a public origin, so a plain `===` leaks the
 * token one byte at a time to anyone patient enough to time the replies. The
 * length is compared first and separately because `timingSafeEqual` throws on
 * mismatched lengths — and it is hashed rather than length-checked directly so
 * even that comparison carries no length information.
 */
export function tokenMatches(expected: string, given: string | null | undefined): boolean {
  if (!expected || !given) return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(given).digest();
  return timingSafeEqual(a, b);
}

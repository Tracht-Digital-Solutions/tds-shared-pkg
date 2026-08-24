/**
 * Where a site's page cache lives on disk, and the symlink that lets the web
 * server reach it.
 *
 * ### The constraint that shapes all of this
 *
 * Under Apache, a `RewriteRule` substitution in a per-directory (`.htaccess`)
 * context is always a URL path — it **cannot** point at a filesystem location
 * outside the document root. So the cache has to be addressable *under* the
 * document root. But the document root is inside the git deploy tree, and a
 * deploy may well wipe anything it does not track.
 *
 * Hence: the store lives OUTSIDE the deploy tree, and a symlink inside the
 * document root points at it. A deploy can at worst destroy the link, never
 * the content — and the link is recreated here on every boot, which every
 * deploy triggers anyway (`touch tmp/restart.txt`). That self-healing is the
 * whole reason this function exists rather than a line in a runbook.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/** The name of the symlink inside the document root. */
export const CACHE_LINK_NAME = "_tds-cache";

/**
 * Marker recording which build filled the cache. Lives in the METADATA
 * directory, which is outside the web tree — and it is skipped by
 * `PageCacheStore.list()`, which only reads `.json` sidecars.
 */
export const BUILD_MARKER_NAME = ".build-id";

/** Default location of the build's content-hashed assets, inside the docroot. */
const DEFAULT_ASSETS_DIR = "_astro";

export interface CacheDirs {
  /** Rendered pages — what the web server serves. */
  dir: string;
  /** Sidecars. Outside the web tree; see below. */
  metaDir: string;
}

export interface ResolveCacheDirsOptions {
  /**
   * Application root. Defaults to `process.cwd()`, which Passenger sets to the
   * application root and `app.cjs` pins explicitly.
   */
  root?: string;
  /** Document root, relative to `root`. `client` in the deployed layout. */
  publicDir?: string;
  /**
   * Where the build puts its content-hashed assets, relative to the document
   * root. Astro's default is `_astro`, which all three sites use.
   *
   * This is what a stored page is checked against — see
   * {@link discardCacheOfOtherBuild}.
   */
  assetsDir?: string;
  /** Where diagnostics go. */
  logger?: (message: string) => void;
}

/**
 * Resolve the cache directories, create them, and make sure the document root
 * can reach the pages directory.
 *
 * `TDS_CACHE_DIR` / `TDS_CACHE_META_DIR` override the defaults; the host sets
 * them to a location beside `httpdocs` so a git deploy cannot touch them.
 *
 * **The two directories are separate on purpose.** The pages directory is
 * reachable from the web by construction — that is what makes a hit free — so
 * anything stored beside a rendered page is public too. Keeping the sidecars
 * in a sibling tree means that stays true no matter how the rewrite rules are
 * later edited: confidentiality rests on the filesystem layout, not on an
 * Apache rule somebody could reorder.
 *
 * Never throws. A cache that cannot be created means every request renders,
 * which is exactly how the site behaved before this existed — a degraded site
 * is a far better failure than one that will not boot.
 */
export function resolveCacheDirs(options: ResolveCacheDirsOptions = {}): CacheDirs {
  const {
    root = process.cwd(),
    publicDir = "client",
    assetsDir = DEFAULT_ASSETS_DIR,
    logger = (m: string) => console.warn(m),
  } = options;

  const fromEnv = (name: string): string | null => {
    const value = (process.env[name] ?? "").trim();
    if (value === "") return null;
    return isAbsolute(value) ? value : resolve(root, value);
  };

  const base = join(root, "var", "page-cache");
  const dir = fromEnv("TDS_CACHE_DIR") ?? join(base, "pages");
  const metaDir = fromEnv("TDS_CACHE_META_DIR") ?? join(base, "meta");

  try {
    mkdirSync(dir, { recursive: true });
    mkdirSync(metaDir, { recursive: true });
  } catch (err) {
    logger(`[tds-cache] could not create the cache directories: ${String(err)}`);
    return { dir, metaDir };
  }

  discardCacheOfOtherBuild(join(root, publicDir), assetsDir, dir, metaDir, logger);
  linkIntoDocumentRoot(join(root, publicDir), dir, logger);
  return { dir, metaDir };
}

/**
 * Throw the cache away when it was filled by a DIFFERENT build.
 *
 * ### The outage this exists for
 *
 * Everything above is about making the cache survive a deploy. That is right
 * for the *store*, and it is wrong for its *contents*: a stored page is HTML,
 * and that HTML names the build's assets by content hash
 * (`/_astro/Hero.CXaElEfT.js`). A deploy rotates every one of those names. So
 * a cache entry that outlives its build points at URLs the host no longer has,
 * and the web server hands it out anyway — Apache serves the file off disk
 * without waking Node, so nothing in the application ever sees the problem.
 *
 * What that looked like in production on 2026-08-24, on `tracht-digital.de`:
 * every `/_astro/*.js` request 404ed, so no island hydrated, and the hero
 * section **vanished** — its headline and slogan are motion elements whose
 * server-rendered markup carries the `initial` state (`opacity: 0`) and are
 * revealed by hydration. Every other section is plain Astro HTML and rendered
 * normally, which is why the page looked complete apart from a blank hero, and
 * why nothing anywhere was red: the response was a `200` with `x-tds-cache:
 * HIT`, the server was healthy, the new assets were all present under their new
 * names, and the only broken thing was that the document asking for them was
 * older than they were.
 *
 * ### Why the fingerprint is the asset directory
 *
 * It could be a build id injected at compile time, and that would be one more
 * thing to wire into three sites and keep correct. The asset filenames ARE the
 * thing that goes stale, so hashing them tests the actual invariant: if the
 * names a page can reference have not changed, no stored page can be dangling.
 * It also needs nothing from the build, so a hand-copied deploy is covered too.
 *
 * ### The rules
 *
 * - **A missing marker clears.** Provenance we cannot establish is provenance
 *   we must not trust — and it is the state of every host the first time this
 *   ships, which is precisely the state that needs clearing.
 * - **Contents, never the directories.** `dir` is what the document root's
 *   symlink points at; removing it would break the link and disconnect the web
 *   server from the store until the next boot. Same rule as
 *   `PageCacheStore.clear()`.
 * - **The marker is written last**, so a clear that dies half way is simply
 *   repeated on the next boot rather than being recorded as done.
 * - **No assets directory means no opinion.** Under `astro dev` there is no
 *   built `client/`, and a host laid out differently is not something to guess
 *   about — in both cases the cache is left exactly as it was found.
 */
function discardCacheOfOtherBuild(
  documentRoot: string,
  assetsDir: string,
  dir: string,
  metaDir: string,
  logger: (message: string) => void,
): void {
  const fingerprint = buildFingerprint(join(documentRoot, assetsDir));
  if (!fingerprint) return;

  const marker = join(metaDir, BUILD_MARKER_NAME);
  let previous: string | null = null;
  try {
    previous = readFileSync(marker, "utf8").trim();
  } catch {
    previous = null;
  }
  if (previous === fingerprint) return;

  emptyContents(dir, logger);
  emptyContents(metaDir, logger);
  logger(
    `[tds-cache] cache discarded: it was filled by build ${previous ?? "unknown"}, this is ${fingerprint}`,
  );

  try {
    writeFileSync(marker, `${fingerprint}\n`);
  } catch (err) {
    // Only costs another clear on the next boot.
    logger(`[tds-cache] could not record the build marker: ${String(err)}`);
  }
}

/**
 * A short hash of the asset FILENAMES in the document root.
 *
 * Names only — never contents. The names are already content hashes, so
 * reading the files would re-hash what they are named after, once per boot,
 * for no additional information.
 */
function buildFingerprint(assetsPath: string): string | null {
  let names: string[];
  try {
    names = readdirSync(assetsPath);
  } catch {
    return null;
  }
  if (names.length === 0) return null;
  return createHash("sha256").update(names.sort().join("\n")).digest("hex").slice(0, 16);
}

/** Remove everything INSIDE a directory, leaving the directory itself. */
function emptyContents(dir: string, logger: (message: string) => void): void {
  let items: string[];
  try {
    items = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of items) {
    try {
      rmSync(join(dir, name), { recursive: true, force: true });
    } catch (err) {
      logger(`[tds-cache] could not remove ${join(dir, name)}: ${String(err)}`);
    }
  }
}

/**
 * Point `<documentRoot>/_tds-cache` at the pages directory.
 *
 * Skipped entirely when the document root does not exist — that is the normal
 * state under `astro dev`, where there is no built `client/` and no Apache to
 * serve through anyway.
 *
 * A `junction` is used on Windows: a plain directory symlink there needs
 * elevated rights, so the developer-platform case would otherwise fail on
 * every boot and bury the message that matters in noise.
 */
function linkIntoDocumentRoot(
  documentRoot: string,
  target: string,
  logger: (message: string) => void,
): void {
  if (!existsSync(documentRoot)) return;

  const link = join(documentRoot, CACHE_LINK_NAME);
  try {
    // `lstat`, not `exists`: a DANGLING symlink does not "exist" — the check
    // follows the link — so an existence test reports nothing there and the
    // symlink call below then fails with EEXIST. A dangling link is exactly
    // the state a deploy leaves behind, i.e. the case this function is for.
    let entry: ReturnType<typeof lstatSync> | null = null;
    try {
      entry = lstatSync(link);
    } catch {
      entry = null;
    }

    if (entry) {
      // A real directory here is somebody's manual fallback (see the
      // AGENTS.md note about hosts that refuse symlinks) — leave it alone.
      if (!entry.isSymbolicLink()) return;
      // A symlink that still resolves is either ours or an equivalent one.
      if (existsSync(link)) return;
      unlinkSync(link);
    }

    symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
  } catch (err) {
    // Worth a line in the log, not worth refusing to start: without the link
    // the web server simply never finds a cache entry and every request goes
    // to Node, which still answers correctly.
    logger(`[tds-cache] could not link ${link} -> ${target}: ${String(err)}`);
  }
}

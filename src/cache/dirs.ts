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

import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/** The name of the symlink inside the document root. */
export const CACHE_LINK_NAME = "_tds-cache";

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

  linkIntoDocumentRoot(join(root, publicDir), dir, logger);
  return { dir, metaDir };
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

/**
 * The page cache's day (2026-10-12): every entry lives until the end of the
 * day it was rendered on — at most 24 hours — and the next request after
 * midnight renders afresh.
 *
 * ### Why a file and not a timestamp check
 *
 * A cache hit never reaches Node: the web server serves it from disk. So the
 * expiry has to be something Apache can test, and `mod_rewrite` can test a
 * file's existence and knows the date (`%{TIME_YEAR}%{TIME_MON}%{TIME_DAY}`).
 * Each site's `.htaccess` therefore requires
 * `_tds-cache/.build-<build>-<YYYYMMDD>`; this module lays that file down.
 * After midnight it is missing, the request falls through to Node, and the
 * middleware calls {@link ensureDailyGate}: empty the store, remove the old
 * day's gates, write today's. Things sampled per render (the landing page's
 * example cards) are drawn anew, and a shop page never shows a partner price
 * from a render older than a day.
 *
 * ### Which day
 *
 * Apache uses the host's local time; Node normally does too, but a `TZ` in
 * the app's environment would split them. Both today's LOCAL and today's UTC
 * gate are written, so Apache finds one whichever clock it reads. Only a new
 * LOCAL day empties the store — a second flush at UTC midnight would buy
 * nothing.
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BUILD_GATE_PREFIX, BUILD_MARKER_NAME, isBuildRecord } from "./dirs.js";

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYYMMDD` of `date` on the host's clock. */
export const localDay = (date: Date): string =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;

/** `YYYYMMDD` of `date` in UTC. */
export const utcDay = (date: Date): string =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;

/** The gate file's name for one build and one day. */
export const dailyGateName = (build: string, day: string): string => `${BUILD_GATE_PREFIX}${build}-${day}`;

/**
 * Make sure today's gates exist; on a new local day, empty the cache first.
 * Returns true when it emptied the cache. Synchronous and cheap on the common
 * path (two `existsSync`), and it only ever runs on a request that already
 * missed the web server's cache.
 */
export function ensureDailyGate(
  dir: string,
  metaDir: string,
  now: Date = new Date(),
  logger: (message: string) => void = (m) => console.warn(m),
): boolean {
  let build: string;
  try {
    build = readFileSync(join(metaDir, BUILD_MARKER_NAME), "utf8").trim();
  } catch {
    return false; // No build record (dev server, no asset tree): no gates.
  }
  if (!build) return false;

  const local = dailyGateName(build, localDay(now));
  const utc = dailyGateName(build, utcDay(now));
  const hasLocal = existsSync(join(dir, local));
  if (hasLocal && existsSync(join(dir, utc))) return false;

  let flushed = false;
  if (!hasLocal) {
    // A new day: the pages go, the build records stay (the same rule as
    // PageCacheStore.clear()), and yesterday's dated gates go with the pages.
    const keep = new Set([local, utc]);
    for (const [root, isPages] of [
      [dir, true],
      [metaDir, false],
    ] as const) {
      let names: string[] = [];
      try {
        names = readdirSync(root);
      } catch {
        continue;
      }
      for (const name of names) {
        const datedGate = isPages && name.startsWith(`${BUILD_GATE_PREFIX}${build}-`) && !keep.has(name);
        if (isBuildRecord(name) && !datedGate) continue;
        try {
          rmSync(join(root, name), { recursive: true, force: true });
        } catch (err) {
          logger(`[tds-cache] could not remove ${join(root, name)}: ${String(err)}`);
        }
      }
    }
    flushed = true;
    logger(`[tds-cache] new day ${localDay(now)}: cache emptied`);
  }

  for (const name of [local, utc]) {
    try {
      writeFileSync(join(dir, name), "");
    } catch (err) {
      // Fails safe: without the gate the web server misses and Node answers.
      logger(`[tds-cache] could not write the day gate: ${String(err)}`);
    }
  }
  return flushed;
}

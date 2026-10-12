import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { dailyGateName, ensureDailyGate, localDay, utcDay } from "./daily.js";
import { BUILD_GATE_PREFIX, BUILD_MARKER_NAME } from "./dirs.js";

describe("ensureDailyGate", () => {
  let root: string;
  let dir: string;
  let metaDir: string;
  const quiet = () => {};

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "tds-daily-"));
    dir = join(root, "pages");
    metaDir = join(root, "meta");
    mkdirSync(dir);
    mkdirSync(metaDir);
    writeFileSync(join(metaDir, BUILD_MARKER_NAME), "abc123\n");
    writeFileSync(join(dir, `${BUILD_GATE_PREFIX}abc123`), "");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const fill = () => {
    writeFileSync(join(dir, "index.html"), "<p>old</p>");
    writeFileSync(join(metaDir, "index.json"), "{}");
  };

  it("writes today's local and UTC gates in the form .htaccess asks for", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    ensureDailyGate(dir, metaDir, now, quiet);
    expect(existsSync(join(dir, `.build-abc123-${localDay(now)}`))).toBe(true);
    expect(existsSync(join(dir, `.build-abc123-${utcDay(now)}`))).toBe(true);
    expect(dailyGateName("abc123", "20261012")).toBe(".build-abc123-20261012");
  });

  it("keeps the cache for the rest of the day", () => {
    const morning = new Date(2026, 9, 12, 9, 0);
    ensureDailyGate(dir, metaDir, morning, quiet);
    fill();
    expect(ensureDailyGate(dir, metaDir, new Date(2026, 9, 12, 21, 0), quiet)).toBe(false);
    expect(existsSync(join(dir, "index.html"))).toBe(true);
  });

  it("empties the cache on a new local day and keeps the build records", () => {
    ensureDailyGate(dir, metaDir, new Date(2026, 9, 12, 9, 0), quiet);
    fill();
    // Midday, so the UTC day has turned as well (just after local midnight
    // the UTC gate of the previous day is still current and rightly kept).
    const tomorrow = new Date(2026, 9, 13, 12, 0);
    expect(ensureDailyGate(dir, metaDir, tomorrow, quiet)).toBe(true);

    expect(existsSync(join(dir, "index.html"))).toBe(false);
    expect(existsSync(join(metaDir, "index.json"))).toBe(false);
    expect(existsSync(join(dir, ".build-abc123-20261012"))).toBe(false);
    expect(existsSync(join(dir, `.build-abc123-${localDay(tomorrow)}`))).toBe(true);
    expect(existsSync(join(dir, `${BUILD_GATE_PREFIX}abc123`))).toBe(true);
    expect(existsSync(join(metaDir, BUILD_MARKER_NAME))).toBe(true);
  });

  it("does nothing without a build record (dev server)", async () => {
    await rm(join(metaDir, BUILD_MARKER_NAME));
    fill();
    expect(ensureDailyGate(dir, metaDir, new Date(), quiet)).toBe(false);
    expect(existsSync(join(dir, "index.html"))).toBe(true);
  });
});

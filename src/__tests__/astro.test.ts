import { describe, expect, it } from "vitest";
import { cssTarget, tdsViteBuild } from "../astro";

/**
 * `cssTarget` is the one build setting every frontend MUST share: it pins
 * the lightningcss browser floor so the frosted `.brand-header` keeps its
 * `-webkit-backdrop-filter` prefix in Safari. A regression here is silent
 * in the browser (no error, no other test), so guard the exact contract.
 * See tds-shared#10 and the note in src/astro/index.ts.
 */
describe("cssTarget", () => {
  it("includes a Safari target so lightningcss keeps the -webkit- prefix", () => {
    const hasSafari = cssTarget.some((t) => t.startsWith("safari"));
    expect(hasSafari, `cssTarget=${cssTarget.join(",")}`).toBe(true);
  });

  it("pins the Safari floor at <=15 (older than the unprefixed-only cutoff)", () => {
    const safari = cssTarget.find((t) => t.startsWith("safari"));
    expect(safari).toBeDefined();
    const version = Number(safari!.replace("safari", ""));
    expect(version).toBeLessThanOrEqual(15);
  });

  it("covers the other evergreen engines so they aren't over-prefixed", () => {
    expect(cssTarget).toEqual(
      expect.arrayContaining(["chrome90", "edge90", "firefox103", "safari15"]),
    );
  });

  it("is a list of non-empty browser-version strings", () => {
    expect(cssTarget.length).toBeGreaterThan(0);
    for (const t of cssTarget) {
      expect(typeof t).toBe("string");
      expect(t).toMatch(/^[a-z]+\d+$/);
    }
  });
});

describe("tdsViteBuild", () => {
  it("selects the lightningcss minifier (the one that reads cssTarget)", () => {
    expect(tdsViteBuild.cssMinify).toBe("lightningcss");
  });

  it("forwards the shared cssTarget array by reference", () => {
    expect(tdsViteBuild.cssTarget).toBe(cssTarget);
  });

  it("is a spreadable vite.build fragment (only known keys)", () => {
    expect(Object.keys(tdsViteBuild).sort()).toEqual(["cssMinify", "cssTarget"]);
  });
});

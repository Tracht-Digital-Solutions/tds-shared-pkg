import { describe, expect, it } from "vitest";
import { tdsPlaceholder, tdsPlaceholderSvg } from "../site/placeholder";

describe("tdsPlaceholder", () => {
  it("draws the same picture for the same seed", () => {
    expect(tdsPlaceholderSvg({ seed: "a-post" })).toBe(tdsPlaceholderSvg({ seed: "a-post" }));
  });

  it("draws different pictures for different seeds", () => {
    const pictures = new Set(Array.from({ length: 20 }, (_, i) => tdsPlaceholderSvg({ seed: `post-${i}` })));
    expect(pictures.size).toBeGreaterThan(15);
  });

  it("uses the brand colours, nothing a data URI cannot resolve", () => {
    const svg = tdsPlaceholderSvg({ seed: 1 });
    expect(svg).toMatch(/#050f68|#820933|#ff7a9c/);
    expect(svg).not.toContain("var(");
  });

  it("escapes a monogram", () => {
    expect(tdsPlaceholderSvg({ seed: 1, monogram: "<a" })).toContain("&lt;a");
  });

  it("is a usable data URI", () => {
    expect(tdsPlaceholder({ seed: 1 })).toMatch(/^data:image\/svg\+xml,%3Csvg/);
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AbstractCover, PostCover, coverVariant, hasPhotoCover } from "../components/PostCover";

// jsdom makes import.meta.url an http URL, so anchor on __dirname like design.test.ts.
const source = readFileSync(join(__dirname, "..", "components", "PostCover.tsx"), "utf8");

describe("coverVariant", () => {
  it("maps a slug to a stable 1..6", () => {
    for (const slug of ["individuelle-software-kosten", "drei-prozesse-automatisierung", "x", ""]) {
      const v = coverVariant(slug);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      expect(coverVariant(slug)).toBe(v);
    }
  });

  // The whole point of sharing this module: the blog and the landingpage must
  // draw the same cover for the same post. That only holds while the hash is
  // one implementation — a copy that drifts produces two artworks silently.
  it("is a pure function of the slug", () => {
    expect(coverVariant("warum-ich-nicht-skaliere")).toBe(coverVariant("warum-ich-nicht-skaliere"));
    expect(coverVariant("a")).not.toBe(coverVariant("aaaaaa"));
  });
});

describe("hasPhotoCover", () => {
  it("accepts absolute URLs and site-local image paths", () => {
    expect(hasPhotoCover("https://api.tracht-digital.de/content/uploads/a.webp")).toBe(true);
    expect(hasPhotoCover("http://example.test/a.png")).toBe(true);
    expect(hasPhotoCover("/journal/individuelle-software-kosten.webp")).toBe(true);
  });

  it("rejects empty values and prose descriptions", () => {
    expect(hasPhotoCover(null)).toBe(false);
    expect(hasPhotoCover(undefined)).toBe(false);
    expect(hasPhotoCover("")).toBe(false);
    // The landingpage's i18n fallback posts carry a *description* of the
    // intended cover in that field; it must never end up in an <img src>.
    expect(hasPhotoCover("Schreibtisch mit Notizbuch und Kostenaufstellung")).toBe(false);
  });
});

describe("PostCover", () => {
  it("renders the photo when there is one", () => {
    const { container } = render(<PostCover slug="s" coverHint="https://example.test/a.webp" title="A" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.test/a.webp");
  });

  it("falls back to the abstract geometry", () => {
    const { container } = render(<PostCover slug="s" coverHint={null} />);
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(/^data:image/);
    expect(container.querySelector("img")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("AbstractCover", () => {
  it("folds any variant number into the six drawings", () => {
    for (const v of [-3, 0, 1, 6, 7, 42]) {
      const { container } = render(<AbstractCover variant={v} />);
      expect(container.firstElementChild).not.toBeNull();
    }
  });

  it("draws through the shared placeholder generator", () => {
    const { container } = render(<AbstractCover variant={2} />);
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  });
});

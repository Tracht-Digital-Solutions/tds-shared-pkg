import { describe, expect, it } from "vitest";
import { PROPERTY_ORIGINS, propertyContact, propertyHome, propertyNav } from "../nav";

/**
 * The shared list of public properties.
 *
 * The journal, the tools site and the shop each named their siblings on their
 * own ("Blog" and "Startseite" on one, "Journal" and "Tracht Digital" on the
 * next, no main site on the third) and in a different order. What is pinned
 * here is exactly what made moving between them feel like three sites.
 */
describe("propertyNav", () => {
  it("lists the four properties in one order, under the same names in both languages", () => {
    for (const lang of ["de", "en"] as const) {
      for (const current of ["journal", "tools", "shop"] as const) {
        expect(propertyNav(current, lang, "/").map((l) => l.label)).toEqual([
          "Journal",
          "Tools",
          "Shop",
          "Tracht Digital",
        ]);
      }
    }
  });

  it("marks exactly the property that renders the header", () => {
    for (const current of ["journal", "tools", "shop"] as const) {
      const marked = propertyNav(current, "de", "/").filter((l) => l.current);
      expect(marked.map((l) => l.key)).toEqual([current]);
    }
  });

  it("links the current property to the home the header passes in", () => {
    // Relative on purpose: a preview deployment must stay on itself.
    expect(propertyNav("shop", "en", "/en/").find((l) => l.key === "shop")?.href).toBe("/en/");
    expect(propertyNav("tools", "de", "/").find((l) => l.key === "tools")?.href).toBe("/");
  });

  it("links every sibling absolutely and in the reader's language", () => {
    for (const lang of ["de", "en"] as const) {
      for (const link of propertyNav("journal", lang, "/").filter((l) => !l.current)) {
        expect(link.href).toMatch(/^https:\/\/([a-z]+\.)?tracht-digital\.de\//);
        expect(link.href.endsWith("/en/")).toBe(lang === "en");
      }
    }
  });
});

describe("propertyHome", () => {
  it("builds a home from the canonical origin", () => {
    expect(propertyHome("journal", "de")).toBe("https://blog.tracht-digital.de/");
    expect(propertyHome("main", "en")).toBe("https://tracht-digital.de/en/");
    for (const origin of Object.values(PROPERTY_ORIGINS)) {
      expect(origin).toMatch(/^https:\/\/[^/]+$/);
    }
  });
});

describe("propertyContact", () => {
  it("sends the CTA to the main site's contact section in the reader's language", () => {
    // Two of the three bars hard-coded the German page for both languages.
    expect(propertyContact("de")).toBe("https://tracht-digital.de/#contact");
    expect(propertyContact("en")).toBe("https://tracht-digital.de/en/#contact");
  });
});

import { describe, expect, it } from "vitest";
import { translations } from "../i18n/translations";

describe("translations", () => {
  it("exposes a `de` and `en` language", () => {
    expect(translations.de).toBeDefined();
    expect(translations.en).toBeDefined();
  });

  it("keeps the top-level shape between DE and EN", () => {
    const deKeys = Object.keys(translations.de).sort();
    const enKeys = Object.keys(translations.en).sort();
    expect(enKeys).toEqual(deKeys);
  });

  it("keeps the nav keys in sync", () => {
    const deKeys = Object.keys(translations.de.nav).sort();
    const enKeys = Object.keys(translations.en.nav).sort();
    expect(enKeys).toEqual(deKeys);
  });

  it("keeps the pricing.items aligned by length and `highlight`", () => {
    const de = translations.de.pricing.items;
    const en = translations.en.pricing.items;
    expect(en.length).toBe(de.length);
    de.forEach((item, i) => {
      expect(en[i]?.highlight).toBe(item.highlight);
    });
  });

  it("never leaves a section title empty", () => {
    for (const lang of ["de", "en"] as const) {
      const t = translations[lang];
      expect(t.hero.headline.trim().length).toBeGreaterThan(0);
      expect(t.about.headline.trim().length).toBeGreaterThan(0);
      expect(t.services.headline.trim().length).toBeGreaterThan(0);
      expect(t.contact.headline.trim().length).toBeGreaterThan(0);
    }
  });
});

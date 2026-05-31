import { describe, expect, it } from "vitest";
import { translations } from "../i18n/translations";

/**
 * Recursively walk both locale bundles and assert the same key /
 * array shape lives in each. Returns the list of paths that diverged
 * so failures surface a useful diff instead of "objects not equal".
 *
 * Arrays compare by length only (item-level parity is asserted
 * separately for the few arrays that carry locale-independent data,
 * like pricing.items.highlight).
 */
function shapeDiff(
  de: unknown,
  en: unknown,
  path: string,
  diffs: string[],
): void {
  if (Array.isArray(de) || Array.isArray(en)) {
    if (!Array.isArray(de) || !Array.isArray(en)) {
      diffs.push(`${path}: array vs non-array`);
      return;
    }
    if (de.length !== en.length) {
      diffs.push(`${path}: array length differs (de=${de.length} en=${en.length})`);
      return;
    }
    de.forEach((d, i) => shapeDiff(d, en[i], `${path}[${i}]`, diffs));
    return;
  }
  if (de && typeof de === "object" && en && typeof en === "object") {
    const deKeys = Object.keys(de).sort();
    const enKeys = Object.keys(en).sort();
    if (deKeys.join("|") !== enKeys.join("|")) {
      diffs.push(
        `${path}: keys differ (de=[${deKeys.join(",")}] en=[${enKeys.join(",")}])`,
      );
      return;
    }
    for (const k of deKeys) {
      shapeDiff(
        (de as Record<string, unknown>)[k],
        (en as Record<string, unknown>)[k],
        path ? `${path}.${k}` : k,
        diffs,
      );
    }
    return;
  }
  if (typeof de !== typeof en) {
    diffs.push(`${path}: type differs (de=${typeof de} en=${typeof en})`);
  }
}

describe("translations", () => {
  it("exposes a `de` and `en` language", () => {
    expect(translations.de).toBeDefined();
    expect(translations.en).toBeDefined();
  });

  it("keeps the full nested shape identical between DE and EN", () => {
    const diffs: string[] = [];
    shapeDiff(translations.de, translations.en, "", diffs);
    expect(diffs, diffs.join("\n")).toEqual([]);
  });

  it("keeps the pricing.items aligned by length and `highlight`", () => {
    const de = translations.de.pricing.items;
    const en = translations.en.pricing.items;
    expect(en.length).toBe(de.length);
    de.forEach((item, i) => {
      expect(en[i]?.highlight).toBe(item.highlight);
    });
  });

  it("keeps services.items aligned by `number`", () => {
    const de = translations.de.services.items;
    const en = translations.en.services.items;
    expect(en.length).toBe(de.length);
    de.forEach((item, i) => {
      expect(en[i]?.number).toBe(item.number);
    });
  });

  it("keeps process.steps aligned by `number`", () => {
    const de = translations.de.process.steps;
    const en = translations.en.process.steps;
    expect(en.length).toBe(de.length);
    de.forEach((step, i) => {
      expect(en[i]?.number).toBe(step.number);
    });
  });

  it("never leaves a section title empty", () => {
    for (const lang of ["de", "en"] as const) {
      const t = translations[lang];
      expect(t.hero.headline.trim().length).toBeGreaterThan(0);
      expect(t.hero.headlineAccent.trim().length).toBeGreaterThan(0);
      expect(t.hero.tagline.trim().length).toBeGreaterThan(0);
      expect(t.about.headline.trim().length).toBeGreaterThan(0);
      expect(t.services.headline.trim().length).toBeGreaterThan(0);
      expect(t.tech.headline.trim().length).toBeGreaterThan(0);
      expect(t.tech.body.trim().length).toBeGreaterThan(0);
      expect(t.process.headline.trim().length).toBeGreaterThan(0);
      expect(t.process.body.trim().length).toBeGreaterThan(0);
      expect(t.consulting.headline.trim().length).toBeGreaterThan(0);
      expect(t.consulting.body.trim().length).toBeGreaterThan(0);
      expect(t.contact.headline.trim().length).toBeGreaterThan(0);
      expect(t.footer.slogan.trim().length).toBeGreaterThan(0);
      expect(t.footer.tagline.trim().length).toBeGreaterThan(0);
    }
  });

  it("differentiates DE and EN copy on the headline strings", () => {
    // Quick sanity check that the EN bundle isn't accidentally
    // copy-pasted from DE on the surface-level strings.
    expect(translations.en.hero.headline).not.toBe(translations.de.hero.headline);
    expect(translations.en.nav.cta).not.toBe(translations.de.nav.cta);
    expect(translations.en.footer.slogan).not.toBe(translations.de.footer.slogan);
  });
});

import { describe, expect, it } from "vitest";
import {
  centsToEuroInput,
  clampToWord,
  formatBytes,
  formatCents,
  formatDate,
  formatDateTime,
  formatIsoDay,
  formatPrice,
  localeOf,
  parseDate,
  parseEuros,
} from "../format";

describe("parseDate", () => {
  it("reads a bare date as a LOCAL calendar day, never UTC midnight", () => {
    const d = parseDate("2026-10-07")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 7, 0]);
  });

  it("accepts the SQL space form (Safari rejects it raw)", () => {
    const d = parseDate("2026-10-07 14:05:00")!;
    expect([d.getHours(), d.getMinutes()]).toEqual([14, 5]);
  });

  it("reads a zone-less datetime as UTC only when asked", () => {
    const utc = parseDate("2026-10-07 14:05:00", { utc: true })!;
    expect(utc.toISOString()).toBe("2026-10-07T14:05:00.000Z");
    // An explicit zone is left alone either way.
    expect(parseDate("2026-10-07T14:05:00+02:00", { utc: true })!.toISOString()).toBe("2026-10-07T12:05:00.000Z");
  });

  it("returns null for empty and garbage", () => {
    for (const v of [null, undefined, "", "nope", Number.NaN]) expect(parseDate(v as never)).toBeNull();
  });
});

describe("formatDate / formatDateTime", () => {
  it("formats numerically in both languages, British English", () => {
    expect(formatDate("2026-10-07")).toBe("07.10.2026");
    expect(formatDate("2026-10-07", { lang: "en" })).toBe("07/10/2026");
    expect(localeOf("en")).toBe("en-GB");
  });

  it("knows the long style", () => {
    expect(formatDate("2026-10-07", { style: "long" })).toBe("7. Oktober 2026");
    expect(formatDate("2026-10-07", { lang: "en", style: "long" })).toBe("7 October 2026");
  });

  it("adds hours and minutes", () => {
    expect(formatDateTime("2026-10-07 14:05:00")).toBe("07.10.2026, 14:05");
  });

  it("renders the fallback for nothing", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime("x", { fallback: "" })).toBe("");
  });

  it("slices a calendar day without any zone round trip", () => {
    expect(formatIsoDay("2026-10-07T23:30:00Z")).toBe("07.10.2026");
    expect(formatIsoDay(null)).toBe("—");
  });
});

describe("money", () => {
  it("formats cents with a currency and survives a bad code", () => {
    expect(formatCents(990)).toBe("9,90 €");
    expect(formatCents(990, { lang: "en" })).toBe("€9.90");
    expect(formatCents(null)).toBe("—");
    expect(formatCents(990, { currency: "NOPE" })).toBe("9.90 NOPE");
    expect(formatPrice(125050, "EUR", "de")).toBe("1.250,50 €");
  });

  it("parses euros as people type them", () => {
    expect(parseEuros("9,90")).toBe(990);
    expect(parseEuros("9.90")).toBe(990);
    expect(parseEuros("1.250,50")).toBe(125050);
    expect(parseEuros(" 1 250,5 € ")).toBe(125050);
    expect(parseEuros("12")).toBe(1200);
    expect(parseEuros("0")).toBe(0);
  });

  it("never rounds or guesses", () => {
    for (const bad of ["", "abc", "9,999", "-5", "9,9,9", "1e3", null]) expect(parseEuros(bad)).toBeNull();
  });

  it("prefills an editable price", () => {
    expect(centsToEuroInput(990)).toBe("9,90");
    expect(centsToEuroInput(990, "en")).toBe("9.90");
    expect(centsToEuroInput(null)).toBe("");
  });
});

describe("formatBytes", () => {
  it("uses binary steps and the language's decimal mark", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(1536, "en")).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024, "de", 2)).toBe("5,00 MB");
  });
});

describe("clampToWord", () => {
  it("leaves short text alone (whitespace collapsed)", () => {
    expect(clampToWord("  kurz   und gut ")).toBe("kurz und gut");
  });

  it("cuts on a word and drops dangling punctuation", () => {
    const out = clampToWord("Ein Satz, der deutlich zu lang ist, für diese Grenze.", 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out).toBe("Ein Satz, der deutlich zu…");
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PREFS_CHANGE_EVENT,
  parsePrefsCookie,
  prefsCookieDomain,
  readPrefs,
  redirectToSavedLocale,
  sanitizePrefs,
  writePrefs,
} from "../prefs";
import { applyThemePreference, readThemePreference } from "../theme";
import { themeBootstrapScript, speculationRules, pageDirectionScript } from "../astro";
import { mountAppTabBar, setTabBadge } from "../app";
import { buildManifest, buildServiceWorker, SW_ALWAYS_EXCLUDED } from "../pwa";

/**
 * The preference cookie is what carries a choice from one property to the
 * next. Every failure here is silent: a wrong Domain drops the write, a
 * malformed value is ignored, a missing bootstrap read means the sibling site
 * paints the OS theme on its first frame.
 */

function clearCookies() {
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

beforeEach(() => {
  clearCookies();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
  document.documentElement.className = "";
});
afterEach(() => vi.restoreAllMocks());

describe("prefs cookie", () => {
  it("scopes the cookie to the registrable domain only on our hosts", () => {
    expect(prefsCookieDomain("blog.tracht-digital.de")).toBe(".tracht-digital.de");
    expect(prefsCookieDomain("tracht-digital.de")).toBe(".tracht-digital.de");
    expect(prefsCookieDomain("localhost")).toBeNull();
    // A lookalike must never get our Domain (the browser would drop it anyway).
    expect(prefsCookieDomain("eviltracht-digital.de")).toBeNull();
  });

  it("keeps only whitelisted keys and values", () => {
    expect(
      sanitizePrefs({ theme: "dark", locale: "fr", reader_zoom: 1.25, other: "x", reader_toc: "open" }),
    ).toEqual({ theme: "dark", reader_zoom: "1.25", reader_toc: "open" });
    expect(sanitizePrefs(null)).toEqual({});
  });

  it("round-trips through document.cookie and announces the change", () => {
    const seen: unknown[] = [];
    window.addEventListener(PREFS_CHANGE_EVENT, (e) => seen.push((e as CustomEvent).detail));
    writePrefs({ locale: "en" });
    writePrefs({ reader_zoom: "1.1" });
    expect(readPrefs()).toEqual({ locale: "en", reader_zoom: "1.1" });
    expect(seen).toHaveLength(2);
    writePrefs({ locale: undefined });
    expect(readPrefs()).toEqual({ reader_zoom: "1.1" });
  });

  it("survives a garbage cookie", () => {
    expect(parsePrefsCookie("tds_prefs=%7Bnot-json")).toEqual({});
    expect(parsePrefsCookie("a=1; tds_prefs=%7B%22theme%22%3A%22dark%22%7D")).toEqual({ theme: "dark" });
  });
});

describe("theme follows the cookie", () => {
  it("writes the theme into the cross-site cookie", () => {
    applyThemePreference("dark");
    expect(readPrefs().theme).toBe("dark");
  });

  it("reads a sibling site's choice when this origin has none", () => {
    document.cookie = `tds_prefs=${encodeURIComponent(JSON.stringify({ theme: "dark" }))}; Path=/`;
    expect(readThemePreference()).toBe("dark");
  });

  it("the no-flash bootstrap paints the cookie theme and publishes the record", () => {
    document.cookie = `tds_prefs=${encodeURIComponent(JSON.stringify({ theme: "dark", reader_zoom: "1.25" }))}; Path=/`;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    new Function(themeBootstrapScript)();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect((window as unknown as { __tdsPrefs: Record<string, string> }).__tdsPrefs.reader_zoom).toBe("1.25");
  });
});

describe("locale redirect", () => {
  it("does nothing without a saved language", () => {
    expect(redirectToSavedLocale("de", "/en/")).toBe(false);
  });

  it("stays put when the visitor came from our own pages", () => {
    writePrefs({ locale: "en" });
    vi.spyOn(document, "referrer", "get").mockReturnValue("https://blog.tracht-digital.de/");
    expect(redirectToSavedLocale("de", "/en/")).toBe(false);
  });

  it("does nothing when the page already has the saved language", () => {
    writePrefs({ locale: "de" });
    expect(redirectToSavedLocale("de", "/en/")).toBe(false);
  });
});

describe("app shell", () => {
  it("publishes the tab bar lane and removes it again", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} }) as never;
    const bar = document.createElement("nav");
    bar.innerHTML = `<a data-tab-match="/" href="/">Start</a><a data-tab-match="/kategorie" href="/kategorie/x">K</a>`;
    document.body.append(bar);
    const destroy = mountAppTabBar(bar);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--tds-tabbar-lane")).toMatch(/px$/);
    expect(root.classList.contains("tds-has-tabbar")).toBe(true);
    destroy();
    expect(root.style.getPropertyValue("--tds-tabbar-lane")).toBe("");
    expect(root.classList.contains("tds-has-tabbar")).toBe(false);
  });

  it("formats the badge and hides it at zero", () => {
    const b = document.createElement("span");
    setTabBadge(b, 3);
    expect(b.textContent).toBe("3");
    setTabBadge(b, 0);
    expect(b.dataset.count).toBe("0");
    expect(b.textContent).toBe("");
    setTabBadge(b, 140);
    expect(b.textContent).toBe("99+");
  });

  it("every bottom-fixed element adds the tab bar lane", () => {
    const base = readFileSync(join(process.cwd(), "styles", "base.css"), "utf8");
    for (const rule of base.match(/bottom:\s*calc\([^;]*--tds-bottom-lane[^;]*;/g) ?? []) {
      expect(rule).toContain("--tds-tabbar-lane");
    }
  });

  it("spells out the dialog position (Tailwind preflight resets margin)", () => {
    const css = readFileSync(join(process.cwd(), "styles", "app-shell.css"), "utf8");
    const rule = css.match(/dialog\.tds-sheet\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/margin:\s*0 auto/);
    expect(rule).toMatch(/inset:/);
  });

  it("inline snippets parse", () => {
    expect(() => new Function(pageDirectionScript)).not.toThrow();
    const rules = JSON.parse(speculationRules(["/kasse"]));
    expect(JSON.stringify(rules)).toContain("/kasse*");
    expect(JSON.stringify(rules)).toContain("/tds*");
  });
});

describe("pwa", () => {
  it("builds an installable manifest", () => {
    const m = buildManifest({
      name: "Tracht Journal",
      shortName: "Journal",
      description: "d",
      lang: "de",
      themeColor: "#0b1640",
      backgroundColor: "#fafaf7",
      icons: [{ src: "/a.png", sizes: "192x192" }, { src: "/b.png", sizes: "512x512", purpose: "maskable" }],
    });
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect((m.icons as Array<{ type: string }>)[0]!.type).toBe("image/png");
  });

  it("the worker never caches the control plane, checkout or account routes", () => {
    const src = buildServiceWorker({ version: "1", offlinePages: { "/": "/offline" }, exclude: ["/kasse", "/warenkorb"] });
    for (const p of [...SW_ALWAYS_EXCLUDED, "/kasse", "/warenkorb"]) expect(src).toContain(JSON.stringify(p));
    // Pages network-first: the network fetch comes before any cache lookup.
    const nav = src.slice(src.indexOf('req.mode === "navigate"'));
    expect(nav.indexOf("fetch(req)")).toBeLessThan(nav.indexOf("caches.match"));
    expect(() => new Function(src)).not.toThrow();
  });
});

describe("sectioned sitemap index", () => {
  it("gives every child its own lastmod and escapes the loc", async () => {
    const { renderSectionedSitemapIndex, newestDay } = await import("../site");
    const xml = renderSectionedSitemapIndex([
      { loc: "https://x.de/sitemap-posts.xml", lastmod: "2026-10-01" },
      { loc: "https://x.de/sitemap-pages.xml?a=1&b=2" },
    ]);
    expect(xml).toContain("<loc>https://x.de/sitemap-posts.xml</loc><lastmod>2026-10-01</lastmod>");
    expect(xml).toContain("a=1&amp;b=2");
    expect(newestDay(["2026-01-02T10:00:00Z", null, "nope", "2026-03-04"])).toBe("2026-03-04");
  });
});

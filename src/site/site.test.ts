import { afterEach, describe, expect, it, vi } from "vitest";

import { createGenerationCache } from "../cache/memo";
import {
  ContentHttpError,
  createContentReader,
  createSiteKeyGuard,
  escapeXml,
  guardSiteKey,
  isConnectionFailure,
  memoisedOr,
  renderSitemapIndex,
  serializeJsonLd,
  SiteKeyRejectedError,
  siteKeyRejectionCount,
} from "./index";

const keyed = (key = "tdsk_x") =>
  createSiteKeyGuard(
    { siteKey: () => key, siteKeyHeaders: () => (key ? { "X-TDS-Site-Key": key } : undefined) },
    { label: "tds-test", reconnectHint: "Bitte neu verbinden." },
  );

afterEach(() => vi.unstubAllGlobals());

describe("site-key guard", () => {
  it("counts a rejection before it throws", () => {
    const before = siteKeyRejectionCount();
    expect(() => keyed().assertKeyAccepted(new Response(null, { status: 401 }), "https://api/x")).toThrow(
      SiteKeyRejectedError,
    );
    expect(siteKeyRejectionCount()).toBe(before + 1);
  });

  it("ignores a 401 to an anonymous read — there was no key to reject", () => {
    const before = siteKeyRejectionCount();
    keyed("").assertKeyAccepted(new Response(null, { status: 401 }), "https://api/x");
    expect(siteKeyRejectionCount()).toBe(before);
  });

  it("marks a render that grew the counter as unstorable", async () => {
    const guard = keyed();
    const res = await guardSiteKey(async () => {
      try {
        guard.assertKeyAccepted(new Response(null, { status: 403 }), "https://api/x");
      } catch {
        /* fail-soft, like the sites */
      }
      return new Response("page", { headers: { "cache-control": "public" } });
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("page");
  });

  it("leaves a clean render untouched", async () => {
    const original = new Response("page");
    expect(await guardSiteKey(async () => original)).toBe(original);
  });
});

describe("content reader", () => {
  it("sends the key, and throws a typed error on an answered failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("no", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const read = createContentReader(keyed());

    const err = await read("https://api/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContentHttpError);
    expect((err as ContentHttpError).status).toBe(503);
    expect(isConnectionFailure(err)).toBe(false);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toEqual({ "X-TDS-Site-Key": "tdsk_x" });
    expect((fetchMock.mock.calls[0]![1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("calls a network error a connection failure", () => {
    expect(isConnectionFailure(new TypeError("fetch failed"))).toBe(true);
    expect(isConnectionFailure(new SiteKeyRejectedError(401, "u"))).toBe(false);
  });
});

describe("memoisedOr", () => {
  it("does not remember a failure, and does remember a success", async () => {
    const cache = createGenerationCache();
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("503")).mockResolvedValue("ok");
    const warn = vi.fn();

    expect(await memoisedOr(cache, "k", load, "fallback", warn)).toBe("fallback");
    expect(await memoisedOr(cache, "k", load, "fallback", warn)).toBe("ok");
    expect(await memoisedOr(cache, "k", load, "fallback", warn)).toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("accepts a fallback factory", async () => {
    const cache = createGenerationCache();
    expect(await memoisedOr(cache, "k", () => Promise.reject(new Error("x")), () => [1], () => {})).toEqual([1]);
  });
});

describe("serialisers", () => {
  it("escapes every XML metacharacter, quotes included", () => {
    expect(escapeXml(`a&b<c>"d'`)).toBe("a&amp;b&lt;c&gt;&quot;d&apos;");
  });

  it("omits lastmod from the index unless a real date is given", () => {
    expect(renderSitemapIndex(["https://x/sitemap-0.xml"])).not.toContain("lastmod");
    expect(renderSitemapIndex(["https://x/sitemap-0.xml"], "2026-10-01")).toContain("<lastmod>2026-10-01</lastmod>");
  });

  it("cannot be ended early by a </script> in the data", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probeHealth, probeRoute, readPublishedConfig } from "../install/checks";
import type { PublicRoute } from "../install/profiles";

/**
 * How the wizard reports what it found — and, more importantly, what it refuses
 * to claim.
 *
 * A failed cross-origin `fetch` rejects with a bare `TypeError` that carries no
 * reason. DNS failure, TLS failure, a dead host and a CORS rejection are
 * indistinguishable from inside a browser. The old PHP wizard could tell them
 * apart because it called from the server; this one must not pretend to, and
 * these tests are what stop a future refactor from "helpfully" hard-coding
 * "CORS" into that message.
 */

const route: PublicRoute = { method: "GET", path: "/content/landing", countKey: "blocks" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("probeRoute", () => {
  it("reports the item count on a healthy JSON response", async () => {
    fetchMock.mockResolvedValue(json({ blocks: [1, 2, 3] }));
    const result = await probeRoute("https://api.example.test", route);
    expect(result).toMatchObject({ reachability: "ok", status: 200, count: 3 });
    expect(result.url).toBe("https://api.example.test/content/landing");
  });

  it("distinguishes reachable-but-empty from broken", async () => {
    fetchMock.mockResolvedValue(json({ blocks: [] }));
    expect(await probeRoute("https://api.example.test", route)).toMatchObject({
      reachability: "ok",
      count: 0,
    });
  });

  it("treats a 200 that is not JSON as an error, not as success", async () => {
    // A static host answers unknown paths with its SPA fallback — 200 plus
    // HTML — so `res.ok` alone proves nothing about what answered. This is the
    // exact shape that made every extension render a calm, permanent empty
    // state for months.
    fetchMock.mockResolvedValue(
      new Response("<!doctype html><title>Startseite</title>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    expect(await probeRoute("https://api.example.test", route)).toMatchObject({
      reachability: "http-error",
      status: 200,
    });
  });

  it("passes an HTTP error status straight through", async () => {
    fetchMock.mockResolvedValue(json({}, 503));
    expect(await probeRoute("https://api.example.test", route)).toMatchObject({
      reachability: "http-error",
      status: 503,
    });
  });

  it("never claims a reason for an opaque failure", async () => {
    // Both calls reject: the real fetch AND the no-cors probe.
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await probeRoute("https://api.example.test", route);
    expect(result.reachability).toBe("blocked");
    expect(result.hint).toBe("host-unreachable");
    expect(result.status).toBeUndefined();
  });

  it("uses a no-cors probe only to narrow a failure, never to pass one", async () => {
    // The real request fails, the opaque one succeeds ⇒ something answered, so
    // CORS is the likely cause. It is still `blocked`: an opaque response has
    // no status and cannot tell a 200 from a 500.
    // The real thing is an opaque response with `status: 0`, which the
    // `Response` constructor refuses to build (it only accepts 200-599). That
    // is precisely why the code under test checks nothing about the response
    // and only cares that the promise resolved — there is nothing else to read.
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await probeRoute("https://api.example.test", route);
    expect(result.reachability).toBe("blocked");
    expect(result.hint).toBe("host-reachable");

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init.mode).toBe("no-cors");
  });
});

describe("probeHealth", () => {
  it("does not try to count /healthz — `services` is a MAP, not a list", () => {
    fetchMock.mockResolvedValue(json({ status: "ok", services: { auth: { status: 200 } } }));
    // Running it through the content path reported a perfectly healthy gateway
    // as "unerwartetes Format", because `countItems` returns null for anything
    // that is not an array. Only a browser showed it: every unit test passed.
    return probeHealth("https://api.example.test").then((result) => {
      expect(result.kind).toBe("health");
      expect(result.reachability).toBe("ok");
      expect(result.count).toBeUndefined();
      expect(result.unhealthy).toEqual([]);
    });
  });

  it("names the services the gateway reports as down", async () => {
    // Status 0 is the signature of a malformed .env killing a service at boot.
    // The gateway itself still answers a cheerful 200, so this is the only
    // place it becomes visible from outside.
    fetchMock.mockResolvedValue(
      json({ services: { auth: { status: 200 }, frontend: { status: 0 }, customer: { status: 500 } } }),
    );
    const result = await probeHealth("https://api.example.test");
    expect(result.reachability).toBe("ok");
    expect(result.unhealthy).toEqual(["frontend (0)", "customer (500)"]);
  });

  it("reports an unreachable gateway without guessing why", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await probeHealth("https://api.example.test");
    expect(result.reachability).toBe("blocked");
    expect(result.unhealthy).toBeUndefined();
  });
});

describe("readPublishedConfig", () => {
  it("busts the cache — the operator just uploaded the file", async () => {
    // Without this the browser can still be holding the 404 from a minute ago,
    // the confirm step stays red forever, and someone goes hunting a bug that
    // is not there.
    fetchMock.mockResolvedValue(json({ version: 1, site: "blog", mode: "direct" }));
    await readPublishedConfig();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^\/tds-runtime\.json\?t=\d+$/);
    expect(init.cache).toBe("no-store");
  });

  it("returns null for the SPA fallback rather than parsing the homepage", async () => {
    fetchMock.mockResolvedValue(
      new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    expect(await readPublishedConfig()).toBeNull();
  });

  it("returns null on 404 and on a network failure", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    expect(await readPublishedConfig()).toBeNull();

    fetchMock.mockRejectedValue(new TypeError("offline"));
    expect(await readPublishedConfig()).toBeNull();
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import {
  ApiError,
  DEFAULT_STALE_TIME,
  invalidate,
  peek,
  put,
  resetCache,
  staleClass,
  useCachedJson,
  useCachedResource,
} from "../data/index.js";
import { primeRuntimeConfig, resetApiBase, resetRuntimeConfig } from "../api/index.js";

/** A component that renders the three states the stale treatment depends on. */
function Probe({
  cacheKey,
  fetcher,
  staleTime,
  enabled = true,
}: {
  cacheKey: string | null;
  fetcher: () => Promise<string>;
  staleTime?: number;
  enabled?: boolean;
}) {
  const { data, stale, loading, error } = useCachedResource(cacheKey, fetcher, {
    ...(staleTime === undefined ? {} : { staleTime }),
    enabled,
  });
  return (
    <div data-testid="box" className={staleClass(stale)} aria-busy={stale || loading}>
      <span data-testid="data">{data ?? "—"}</span>
      <span data-testid="loading">{loading ? "loading" : "idle"}</span>
      <span data-testid="error">{error ? error.message : "none"}</span>
    </div>
  );
}

const text = (id: string): string => screen.getByTestId(id).textContent ?? "";
const box = (): HTMLElement => screen.getByTestId("box");

beforeEach(() => {
  resetCache();
  // The panels ship <meta name="tds-api-base">, never a runtime config file —
  // priming it null is what production looks like AND stops apiFetch putting a
  // /tds-runtime.json probe in front of every assertion.
  primeRuntimeConfig(null);
});

afterEach(() => {
  cleanup();
  resetCache();
  resetRuntimeConfig();
  resetApiBase();
});

describe("useCachedResource", () => {
  it("shows a loading state on the first load and the value after it", async () => {
    const fetcher = vi.fn(async () => "erste Antwort");
    render(<Probe cacheKey="/a" fetcher={fetcher} />);

    expect(text("loading")).toBe("loading");
    expect(text("data")).toBe("—");

    await waitFor(() => expect(text("data")).toBe("erste Antwort"));
    expect(text("loading")).toBe("idle");
  });

  it("paints a cached value immediately on the next mount", async () => {
    const fetcher = vi.fn(async () => "wert");
    render(<Probe cacheKey="/a" fetcher={fetcher} />);
    await waitFor(() => expect(text("data")).toBe("wert"));
    cleanup();

    // This is the whole point: a remount inside the freshness window has the
    // value on the FIRST render, with no loading state in between.
    render(<Probe cacheKey="/a" fetcher={fetcher} />);
    expect(text("data")).toBe("wert");
    expect(text("loading")).toBe("idle");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("hydrates server markup safely before revealing this tab's cached value", async () => {
    const fetcher = vi.fn(async () => "Netzwerk");
    // The server has no access to this browser tab's memory cache.
    const html = renderToString(<Probe cacheKey="/hydrate" fetcher={fetcher} />);
    expect(html).toContain("—");

    // Between receiving the HTML and hydrating it, the surviving ClientRouter
    // runtime still has the value from an earlier visit to this screen.
    put("/hydrate", "aus Cache");
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const root = hydrateRoot(container, <Probe cacheKey="/hydrate" fetcher={fetcher} />);
    await waitFor(() =>
      expect(container.querySelector('[data-testid="data"]')?.textContent).toBe("aus Cache"),
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(
      consoleError.mock.calls.some(([message]) => String(message).includes("Hydration failed")),
    ).toBe(false);

    await act(async () => root.unmount());
    consoleError.mockRestore();
    container.remove();
  });

  it("does not re-fetch at all while the value is still fresh", async () => {
    const fetcher = vi.fn(async () => "wert");
    render(<Probe cacheKey="/a" fetcher={fetcher} />);
    await waitFor(() => expect(text("data")).toBe("wert"));
    cleanup();

    render(<Probe cacheKey="/a" fetcher={fetcher} />);
    await act(async () => {});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("marks the container stale while it refreshes an expired value", async () => {
    let resolve: (v: string) => void = () => {};
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("alt")
      .mockImplementationOnce(() => new Promise<string>((r) => (resolve = r)));

    render(<Probe cacheKey="/a" fetcher={fetcher} staleTime={0} />);
    await waitFor(() => expect(text("data")).toBe("alt"));
    cleanup();

    render(<Probe cacheKey="/a" fetcher={fetcher} staleTime={0} />);
    // Old value visible, dimmed, and announced as busy — never a blank screen
    // and never a confident-looking stale one.
    await waitFor(() => expect(box().classList.contains("tds-stale")).toBe(true));
    expect(text("data")).toBe("alt");
    expect(box().getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      resolve("neu");
    });
    expect(text("data")).toBe("neu");
    expect(box().classList.contains("tds-stale")).toBe(false);
  });

  it("keeps the previous value when a refresh fails", async () => {
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("alt")
      .mockRejectedValueOnce(new Error("kaputt"));

    render(<Probe cacheKey="/a" fetcher={fetcher} staleTime={0} />);
    await waitFor(() => expect(text("data")).toBe("alt"));
    cleanup();

    render(<Probe cacheKey="/a" fetcher={fetcher} staleTime={0} />);
    await waitFor(() => expect(text("error")).toBe("kaputt"));
    // The regression this guards: a failed refresh emptying a working list is
    // exactly the calm-permanent-empty-state bug.
    expect(text("data")).toBe("alt");
  });

  it("de-duplicates concurrent readers of the same key", async () => {
    const fetcher = vi.fn(async () => "wert");
    render(
      <>
        <Probe cacheKey="/shared" fetcher={fetcher} />
        <Probe cacheKey="/shared" fetcher={fetcher} />
        <Probe cacheKey="/shared" fetcher={fetcher} />
      </>,
    );
    await waitFor(() => expect(screen.getAllByTestId("data")[0]?.textContent).toBe("wert"));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fetches nothing for a null key or a disabled resource", async () => {
    const fetcher = vi.fn(async () => "wert");
    render(
      <>
        <Probe cacheKey={null} fetcher={fetcher} />
        <Probe cacheKey="/b" fetcher={fetcher} enabled={false} />
      </>,
    );
    await act(async () => {});
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("defaults to a freshness window rather than revalidating on every mount", () => {
    // Stated as a test because the number is a product decision: at 0 the panel
    // would dim and pulse on literally every navigation, which is the noise
    // this mechanism exists to remove.
    expect(DEFAULT_STALE_TIME).toBeGreaterThanOrEqual(10_000);
  });
});

describe("invalidate", () => {
  it("marks a family stale by prefix without dropping its visible values", () => {
    put("/cms/x/blocks", "liste");
    put("/cms/x/blocks/hero", "block");
    put("/blogs", "blogs");

    invalidate("/cms/");

    // SWR means stale-WHILE-revalidate: deleting these entries would blank the
    // CMS between its successful save and the replacement GET.
    expect(peek<string>("/cms/x/blocks")?.value).toBe("liste");
    expect(peek<string>("/cms/x/blocks/hero")?.value).toBe("block");
    expect(peek<string>("/blogs")?.value).toBe("blogs");
  });

  it("keeps old data visible and dimmed while a mounted consumer refetches", async () => {
    let resolve: (value: string) => void = () => {};
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("alt")
      .mockImplementationOnce(() => new Promise<string>((done) => (resolve = done)));
    render(<Probe cacheKey="/a" fetcher={fetcher} />);
    await waitFor(() => expect(text("data")).toBe("alt"));

    await act(async () => {
      invalidate("/a");
    });

    await waitFor(() => expect(box().classList.contains("tds-stale")).toBe(true));
    expect(text("data")).toBe("alt");
    expect(text("loading")).toBe("idle");

    await act(async () => resolve("neu"));
    expect(text("data")).toBe("neu");
    expect(box().classList.contains("tds-stale")).toBe(false);
  });

  it("discards the answer to a request the invalidate overtook", async () => {
    let resolve: (v: string) => void = () => {};
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => new Promise<string>((r) => (resolve = r)))
      .mockResolvedValue("frisch");

    render(<Probe cacheKey="/a" fetcher={fetcher} />);
    await act(async () => {
      invalidate("/a");
      // The first request lands AFTER the invalidate. Writing it would
      // resurrect exactly the state the caller just declared wrong.
      resolve("überholt");
    });
    await waitFor(() => expect(text("data")).toBe("frisch"));
  });
});

describe("put", () => {
  it("cannot be overwritten by an older request that lands afterwards", async () => {
    let resolve: (value: string) => void = () => {};
    const fetcher = vi.fn(
      () => new Promise<string>((done) => {
        resolve = done;
      }),
    );

    render(<Probe cacheKey="/a" fetcher={fetcher} />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    await act(async () => {
      put("/a", "aus Mutation");
      resolve("alte GET-Antwort");
    });

    expect(text("data")).toBe("aus Mutation");
    expect(peek<string>("/a")?.value).toBe("aus Mutation");
  });
});

describe("useCachedJson", () => {
  function JsonProbe({ path }: { path: string }) {
    const { data, error } = useCachedJson<{ name: string }>(path);
    return <span data-testid="out">{error ? error.message : (data?.name ?? "—")}</span>;
  }

  it("reads through apiFetch against the ABSOLUTE api base", async () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "tds-api-base");
    meta.setAttribute("content", "https://api.example.test");
    document.head.appendChild(meta);
    resetApiBase();

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ name: "Julian" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<JsonProbe path="/me" />);
    await waitFor(() => expect(text("out")).toBe("Julian"));

    // A relative path satisfies every path-based assertion and is precisely
    // the regression that made the panel read its own SPA fallback, so the
    // assertion is on the absolute host.
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.example.test/me");
    meta.remove();
  });

  it("surfaces the HTTP status instead of returning an empty fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 403 })),
    );
    render(<JsonProbe path="/admin/secret" />);
    await waitFor(() => expect(text("out")).toContain("403"));
  });

  it("exposes the status on the error object", () => {
    const err = new ApiError(503, "/tools/registry");
    expect(err.status).toBe(503);
    expect(err.path).toBe("/tools/registry");
  });
});

describe("staleClass", () => {
  it("appends the marker only while stale and keeps the base classes", () => {
    expect(staleClass(false, "tds-list")).toBe("tds-list");
    expect(staleClass(true, "tds-list")).toBe("tds-list tds-stale");
    expect(staleClass(true)).toBe("tds-stale");
  });
});

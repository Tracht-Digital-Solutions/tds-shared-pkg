// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_BASE_META,
  DEFAULT_API_BASE,
  apiBase,
  apiFetch,
  apiUrl,
  resetApiBase,
  setRequestHeadersProvider,
  setUnauthorizedHandler,
} from "../api";

const setMeta = (content: string) => {
  const meta = document.createElement("meta");
  meta.setAttribute("name", API_BASE_META);
  meta.setAttribute("content", content);
  document.head.appendChild(meta);
};

const ok = (status = 200) => new Response("{}", { status });

beforeEach(() => {
  resetApiBase();
  setUnauthorizedHandler(null);
  document.head.innerHTML = "";
});

afterEach(() => {
  vi.restoreAllMocks();
  resetApiBase();
  setUnauthorizedHandler(null);
});

describe("apiBase", () => {
  it("falls back to the production gateway when nothing is configured", () => {
    expect(apiBase()).toBe(DEFAULT_API_BASE);
  });

  it("prefers the host's meta tag", () => {
    setMeta("https://api.example.test");
    expect(apiBase()).toBe("https://api.example.test");
  });

  it("strips a trailing slash so apiUrl never produces a double slash", () => {
    setMeta("https://api.example.test/");
    expect(apiUrl("/contact/messages")).toBe("https://api.example.test/contact/messages");
  });

  it("ignores a blank meta tag rather than resolving to the current origin", () => {
    // An empty content attribute is what a mis-templated host would render.
    // Treating it as "same-origin" is the exact bug this module exists to
    // prevent, so it must fall through to the default instead.
    setMeta("   ");
    expect(apiBase()).toBe(DEFAULT_API_BASE);
  });

  it("memoises, so a late DOM change does not split calls across two origins", () => {
    setMeta("https://first.test");
    expect(apiBase()).toBe("https://first.test");
    document.head.innerHTML = "";
    setMeta("https://second.test");
    expect(apiBase()).toBe("https://first.test");
  });
});

describe("apiUrl", () => {
  it("prefixes a relative path", () => {
    setMeta("https://api.example.test");
    expect(apiUrl("/contact/messages?status=new")).toBe(
      "https://api.example.test/contact/messages?status=new",
    );
  });

  it("inserts the missing slash of a bare path", () => {
    setMeta("https://api.example.test");
    expect(apiUrl("contact/summary")).toBe("https://api.example.test/contact/summary");
  });

  it("leaves an absolute URL alone, so wrapping a call site is idempotent", () => {
    setMeta("https://api.example.test");
    expect(apiUrl("https://auth.example.test/me")).toBe("https://auth.example.test/me");
    expect(apiUrl("//cdn.example.test/x.json")).toBe("//cdn.example.test/x.json");
  });
});

describe("apiFetch", () => {
  it("sends the session cookie and hits the absolute URL", async () => {
    setMeta("https://api.example.test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());

    await apiFetch("/contact/messages");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/contact/messages",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("lets the caller override the method without losing credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());
    const res = await apiFetch("/contact/messages/1", { method: "PATCH" });
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${DEFAULT_API_BASE}/contact/messages/1`,
      expect.objectContaining({ credentials: "include", method: "PATCH" }),
    );
  });

  it("returns the original response so a caller can handle its own 403", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(403));
    const res = await apiFetch("/contact/messages");
    expect(res.status).toBe(403);
  });

  it("calls the registered handler exactly once on a 401, with the resolved URL", async () => {
    setMeta("https://api.example.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(401));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    const res = await apiFetch("/contact/messages");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("https://api.example.test/contact/messages");
    // Still handed back — a 401 may be legitimate RBAC, not a dead session.
    expect(res.status).toBe(401);
  });

  it("does not call the handler on a 403", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(403));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    await apiFetch("/contact/messages");
    expect(handler).not.toHaveBeenCalled();
  });

  it("survives a handler that throws — the 401 is still returned", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(401));
    setUnauthorizedHandler(() => {
      throw new Error("boom");
    });
    await expect(apiFetch("/contact/messages")).resolves.toMatchObject({ status: 401 });
  });
});

describe("setRequestHeadersProvider", () => {
  // The company switcher's transport seam. Its whole reason for existing is
  // that an extension island cannot reach into the host to add a header.
  afterEach(() => setRequestHeadersProvider(null));

  it("adds the provider's headers to every call", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    setRequestHeadersProvider(() => ({ "X-Act-As-Company": "7" }));

    await apiFetch("/tickets");

    const init = fetchMock.mock.calls[0]?.[1] as unknown as RequestInit;
    expect((init.headers as Record<string, string>)["X-Act-As-Company"]).toBe("7");
    expect(init.credentials).toBe("include");
  });

  it("lets the CALLER's header win", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    setRequestHeadersProvider(() => ({ "X-Act-As-Company": "7", "X-Keep": "yes" }));

    await apiFetch("/tickets", { headers: { "X-Act-As-Company": "9" } });

    const headers = (fetchMock.mock.calls[0]?.[1] as unknown as RequestInit)
      .headers as Record<string, string>;
    expect(headers["X-Act-As-Company"]).toBe("9");
    expect(headers["X-Keep"]).toBe("yes");
  });

  it("hands the provider the RESOLVED absolute url", async () => {
    // Which headers are safe depends on where the call is going: the auth API
    // allows a narrower set than the composed API, and a disallowed header
    // fails the preflight — so the request is never sent and the control just
    // looks dead. The provider cannot make that call without the target.
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 })));
    setRequestHeadersProvider((url) => {
      seen.push(url);
      return {};
    });

    await apiFetch("/tickets");

    expect(seen[0]).toMatch(/^https?:\/\/.+\/tickets$/);
  });

  it("survives a throwing provider", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    setRequestHeadersProvider(() => {
      throw new Error("boom");
    });

    await expect(apiFetch("/tickets")).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("is a no-op once unregistered", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    setRequestHeadersProvider(() => ({ "X-Act-As-Company": "7" }));
    setRequestHeadersProvider(null);

    await apiFetch("/tickets");

    const headers = (fetchMock.mock.calls[0]?.[1] as unknown as RequestInit)
      .headers as Record<string, string>;
    expect(headers["X-Act-As-Company"]).toBeUndefined();
  });
});

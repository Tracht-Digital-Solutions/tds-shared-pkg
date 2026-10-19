// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { secretHint, usePairing, useRuntimeSettings } from "../admin";
import { describeFailure, describeFailureFrom, primeRuntimeConfig, sendJson } from "../api";
import { TOAST_EVENT } from "../toast";

afterEach(cleanup);
beforeEach(() => primeRuntimeConfig(null));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function toasts() {
  const seen: Array<{ variant: string; message: string }> = [];
  const on = (e: Event) => seen.push((e as CustomEvent).detail);
  window.addEventListener(TOAST_EVENT, on);
  return { seen, stop: () => window.removeEventListener(TOAST_EVENT, on) };
}

describe("api helpers", () => {
  it("sendJson sets the header and the body", async () => {
    const fetch = vi.fn().mockResolvedValue(json({}));
    vi.stubGlobal("fetch", fetch);
    await sendJson("/x", "PUT", { a: 1 });
    const [, init] = fetch.mock.calls[0]!;
    expect(init.method).toBe("PUT");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe('{"a":1}');
  });

  it("describes failures in the panel's wording", async () => {
    expect(describeFailure(null, "Speichern fehlgeschlagen")).toBe("Speichern fehlgeschlagen — die API ist nicht erreichbar.");
    expect(describeFailure(new Response("", { status: 500 }))).toBe("Fehler (HTTP 500).");
    expect(describeFailure(new Response("", { status: 403 }), "x", { adminOnly: true })).toBe("Nur für Administratoren.");
    expect(await describeFailureFrom(json({ error: "Name fehlt" }, 422))).toBe("Name fehlt (HTTP 422)");
    expect(await describeFailureFrom(new Response("<html>", { status: 502 }), "Laden fehlgeschlagen")).toBe("Laden fehlgeschlagen (HTTP 502).");
  });
});

describe("useRuntimeSettings", () => {
  it("loads the namespace into a map and saves with a toast", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ settings: [{ key: "api_key", secret: true, configured: true, last4: "1234" }, { key: "url", secret: false, value: "https://x" }] }))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ settings: [] }));
    vi.stubGlobal("fetch", fetch);
    const t = toasts();
    const { result } = renderHook(() => useRuntimeSettings("lexware"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetch.mock.calls[0]![0]).toMatch(/\/admin\/settings\/lexware$/);
    expect(secretHint(result.current.get("api_key"))).toBe("konfiguriert (…1234)");
    expect(result.current.value("url")).toBe("https://x");
    expect(result.current.value("missing", "fb")).toBe("fb");

    await act(async () => {
      expect(await result.current.save([{ key: "api_key", secret: true, value: "" }])).toBe(true);
    });
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ settings: [{ key: "api_key", secret: true, value: "" }] });
    expect(t.seen.at(-1)).toMatchObject({ variant: "success", message: "Gespeichert." });
    t.stop();
  });

  it("shows admin-only and unreachable in-flow, never an endless spinner", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));
    const a = renderHook(() => useRuntimeSettings("x"));
    await waitFor(() => expect(a.result.current.error).toBe("Nur für Administratoren."));

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const b = renderHook(() => useRuntimeSettings("y"));
    await waitFor(() => expect(b.result.current.loaded).toBe(true));
    expect(b.result.current.error).toBe("Einstellungen konnten nicht geladen werden — die API ist nicht erreichbar.");
  });
});

describe("usePairing", () => {
  it("loads, connects and reports the site's refusal", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(json({ delivered: false, fallback_url: "https://site/install?c=1", error: "HTTP 422: invalid_origin" }));
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => usePairing({ base: "/blogs/journal", profile: "blog", subject: "Der Blog" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connection).toBeNull();
    await act(async () => {
      expect(await result.current.connect(" https://blog.example ", { website: "main" })).toBe(false);
    });
    const [url, init] = fetch.mock.calls[1]!;
    expect(url).toMatch(/\/blogs\/journal\/connection\/pairing$/);
    expect(JSON.parse(init.body)).toEqual({ origin: "https://blog.example", profile: "blog", bindings: { website: "main" } });
    expect(result.current.installUrl).toBe("https://site/install?c=1");
    expect(result.current.status).toContain("Der Blog hat die Verbindung nicht direkt angenommen (HTTP 422: invalid_origin)");
  });

  it("offers the candidates on an ambiguous binding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(json({ origin: "https://a" })).mockResolvedValueOnce(json({ candidates: ["a", "b"] }, 422)),
    );
    const { result } = renderHook(() => usePairing({ base: "/sites/x", profile: "website", subject: "Die Website" }));
    await waitFor(() => expect(result.current.connection).toEqual({ origin: "https://a" }));
    await act(async () => void (await result.current.connect("https://a")));
    expect(result.current.candidates).toEqual(["a", "b"]);
  });

  it("disconnects and rebuilds with toasts", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ connection: { origin: "https://a" } }))
        .mockResolvedValueOnce(json({}))
        .mockResolvedValueOnce(new Response("", { status: 503 })),
    );
    const t = toasts();
    const { result } = renderHook(() => usePairing({ base: "/tools", profile: "tools", subject: "Die Tools-Site" }));
    await waitFor(() => expect(result.current.connection).not.toBeNull());
    await act(async () => void (await result.current.disconnect()));
    expect(result.current.connection).toBeNull();
    expect(t.seen.at(-1)).toMatchObject({ variant: "success", message: "Verbindung getrennt." });
    await act(async () => void (await result.current.rebuildCache()));
    expect(result.current.status).toBe("Die Tools-Site ist noch nicht vollständig mit der API verbunden.");
    t.stop();
  });
});

import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectionStore, resolveConnectionDirectory } from "./store";
import { SiteConnectionService } from "./service";
import type { SiteConnection } from "./types";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "tds-connection-"));
  roots.push(value);
  return value;
}

function state(overrides: Partial<SiteConnection> = {}): SiteConnection {
  return {
    version: 1,
    profile: "blog",
    origin: "https://blog.example.test",
    apiBase: "https://api.example.test",
    siteKey: "tdsk_private",
    cacheToken: "cache_private",
    resource: { type: "blog", id: 7 },
    runtime: {
      version: 1,
      site: "blog",
      mode: "direct",
      apiBase: "https://api.example.test",
    },
    pairingId: "pair_1",
    connectedAt: "2026-08-26T12:00:00.000Z",
    ...overrides,
  };
}

describe("ConnectionStore", () => {
  it("defaults outside the deploy root and appends the profile", async () => {
    const app = join(await root(), "current");
    expect(resolveConnectionDirectory({ profile: "blog", root: app, env: {} })).toBe(
      resolve(app, "..", ".tds-state", "blog"),
    );
  });

  it("honours TDS_STATE_DIR and writes an owner-only atomic state file", async () => {
    const base = await root();
    const store = new ConnectionStore({
      profile: "blog",
      root: join(base, "deploy"),
      env: { TDS_STATE_DIR: join(base, "private") },
    });
    await store.write(state());

    expect(await store.read()).toEqual(state());
    expect(JSON.parse(await readFile(store.file, "utf8"))).toMatchObject({ siteKey: "tdsk_private" });
    if (process.platform !== "win32") expect((await stat(store.file)).mode & 0o777).toBe(0o600);
  });

  it("rejects malformed or cross-profile files", async () => {
    const base = await root();
    const store = new ConnectionStore({ profile: "blog", stateDir: base });
    await expect(store.write(state({ profile: "tools" } as Partial<SiteConnection>))).rejects.toThrow(
      "invalid_connection_state",
    );
  });
});

describe("SiteConnectionService", () => {
  it("exchanges, persists, verifies and finalizes without exposing secrets", async () => {
    const base = await root();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          pairing_id: "pair_1",
          finalize_token: "finalize_secret",
          connection: {
            version: 1,
            profile: "blog",
            origin: "https://blog.example.test",
            api_base: "https://api.example.test",
            site_key: "tdsk_private",
            cache_token: "cache_private",
            resource: { type: "blog", id: 7 },
            runtime: { loginUrl: "https://auth.example.test" },
          },
        }),
      )
      .mockResolvedValueOnce(Response.json({ connected: true }));
    const service = new SiteConnectionService({
      profile: "blog",
      stateDir: base,
      fallbackApiBase: "https://api.example.test",
      fetch: fetcher,
      now: () => new Date("2026-08-26T12:00:00.000Z"),
    });

    const result = await service.connect(
      { pairing_token: "a".repeat(43), api_base: "https://api.example.test" },
      "https://blog.example.test",
    );

    expect(result).toEqual({
      connected: true,
      profile: "blog",
      origin: "https://blog.example.test",
      resource: { type: "blog", id: 7 },
      connected_at: "2026-08-26T12:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(service.siteKey()).toBe("tdsk_private");
    expect(service.cacheToken()).toBe("cache_private");
    expect(service.publicRuntime()).toMatchObject({
      apiBase: "https://api.example.test",
      loginUrl: "https://auth.example.test",
    });
    expect(JSON.stringify(service.publicRuntime())).not.toContain("tdsk_private");

    const [exchangeUrl, exchangeInit] = fetcher.mock.calls[0]!;
    expect(exchangeUrl).toBe("https://api.example.test/sites/pairings/exchange");
    expect(exchangeInit?.redirect).toBe("error");
    expect(JSON.parse(String(exchangeInit?.body))).toEqual({
      pairing_token: "a".repeat(43),
      profile: "blog",
      origin: "https://blog.example.test",
    });
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toEqual({
      pairing_id: "pair_1",
      finalize_token: "finalize_secret",
      profile: "blog",
      origin: "https://blog.example.test",
    });
  });

  it("keeps the previous connection when finalize fails", async () => {
    const base = await root();
    const store = new ConnectionStore({ profile: "blog", stateDir: base });
    await store.write(state({ pairingId: "old", siteKey: "old_key", cacheToken: "old_cache" }));
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          pairing_id: "new",
          finalize_token: "finalize_secret",
          connection: {
            version: 1,
            profile: "blog",
            origin: "https://blog.example.test",
            api_base: "https://api.example.test",
            site_key: "new_key",
            cache_token: "new_cache",
            resource: { type: "blog", id: 7 },
          },
        }),
      )
      .mockResolvedValueOnce(Response.json({ error: "failed" }, { status: 500 }));
    const service = new SiteConnectionService({
      profile: "blog",
      stateDir: base,
      fallbackApiBase: "https://api.example.test",
      fetch: fetcher,
    });

    await expect(
      service.connect(
        { pairing_token: "b".repeat(43), api_base: "https://api.example.test" },
        "https://blog.example.test",
      ),
    ).rejects.toMatchObject({ code: "finalize_failed" });
    expect((await store.read())?.pairingId).toBe("old");
    expect((await store.read())?.siteKey).toBe("old_key");
  });

  it("uses environment fallbacks only until a state file exists", async () => {
    const base = await root();
    const service = new SiteConnectionService({
      profile: "blog",
      stateDir: base,
      fallbackApiBase: "https://legacy-api.example.test",
      fallbackSiteKey: "legacy_key",
      fallbackCacheToken: "legacy_cache",
    });
    expect(service.apiBase()).toBe("https://legacy-api.example.test");
    expect(service.status()).toMatchObject({ connected: false, legacy_environment: true });
    await service.store.write(state());
    expect(service.apiBase()).toBe("https://api.example.test");
    expect(service.siteKey()).toBe("tdsk_private");
    expect(service.status()).toMatchObject({ connected: true, legacy_environment: false });
  });

  it("rejects insecure API origins before making a request", async () => {
    const base = await root();
    const service = new SiteConnectionService({ profile: "blog", stateDir: base, fetch: vi.fn() });
    await expect(
      service.connect(
        { pairing_token: "c".repeat(43), api_base: "http://api.example.test" },
        "https://blog.example.test",
      ),
    ).rejects.toMatchObject({ code: "invalid_origin", status: 422 });
  });

  it("rejects a valid-looking HTTPS API that is not locally trusted", async () => {
    const base = await root();
    const fetcher = vi.fn<typeof fetch>();
    const service = new SiteConnectionService({
      profile: "blog",
      stateDir: base,
      fallbackApiBase: "https://api.example.test",
      fetch: fetcher,
    });
    await expect(
      service.connect(
        { pairing_token: "d".repeat(43), api_base: "https://attacker.example.test" },
        "https://blog.example.test",
      ),
    ).rejects.toMatchObject({ code: "untrusted_api_origin", status: 422 });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await service.store.read()).toBeNull();
  });
});

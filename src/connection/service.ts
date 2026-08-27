import type { RuntimeConfig, RuntimeKey } from "../api/index.js";
import { ConnectionStore, type ConnectionStoreOptions } from "./store.js";
import type {
  PairableSiteProfile,
  PairingExchangeResponse,
  PublicConnectionStatus,
  SiteConnection,
} from "./types.js";

const RUNTIME_KEYS: RuntimeKey[] = [
  "apiBase",
  "authBase",
  "loginUrl",
  "contactUrl",
  "liveChatFrontend",
];

export interface SiteConnectionOptions extends ConnectionStoreOptions {
  profile: PairableSiteProfile;
  /** Public fallback used during the one-release environment transition. */
  fallbackApiBase?: string | (() => string);
  fallbackSiteKey?: string | (() => string);
  fallbackCacheToken?: string | (() => string);
  fallbackRuntime?: Partial<RuntimeConfig> | (() => Partial<RuntimeConfig>);
  /** Additional API origins explicitly trusted for a controlled migration. */
  trustedApiBases?: string[];
  fetch?: typeof fetch;
  now?: () => Date;
  /** Site-specific work after a successful finalize (for example catalog sync). */
  onConnected?: (connection: SiteConnection) => void | Promise<void>;
}

export interface ConnectBody {
  pairing_token: string;
  api_base: string;
}

export interface ConnectResult {
  connected: true;
  profile: PairableSiteProfile;
  origin: string;
  resource: SiteConnection["resource"];
  connected_at: string;
  warning?: "post_connect_failed";
}

function valueOf(value: string | (() => string) | undefined): string {
  return (typeof value === "function" ? value() : value ?? "").trim();
}

function runtimeOf(
  value: Partial<RuntimeConfig> | (() => Partial<RuntimeConfig>) | undefined,
): Partial<RuntimeConfig> {
  return typeof value === "function" ? value() : (value ?? {});
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Strict origin validation prevents pairing from becoming an SSRF proxy. */
export function normalizeSecureOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function runtimeConfig(
  profile: PairableSiteProfile,
  apiBase: string,
  supplied: Partial<RuntimeConfig> | undefined,
  generatedAt: string,
): RuntimeConfig {
  const out: RuntimeConfig = {
    version: 1,
    site: profile,
    mode: "direct",
    generatedAt,
    apiBase,
  };
  for (const key of RUNTIME_KEYS) {
    const value = supplied?.[key];
    if (typeof value === "string" && value.trim() !== "") out[key] = value.trim().replace(/\/+$/, "");
  }
  // The wire's snake-case API base is authoritative.
  out.apiBase = apiBase;
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseExchange(
  value: unknown,
  profile: PairableSiteProfile,
  origin: string,
  apiBase: string,
  connectedAt: string,
): { finalizeToken: string; connection: SiteConnection } | null {
  if (!isRecord(value) || typeof value.pairing_id !== "string" || typeof value.finalize_token !== "string") return null;
  const wire = value.connection;
  if (!isRecord(wire) || wire.version !== 1 || wire.profile !== profile) return null;
  if (normalizeSecureOrigin(String(wire.origin ?? "")) !== origin) return null;
  if (normalizeSecureOrigin(String(wire.api_base ?? "")) !== apiBase) return null;
  if (typeof wire.site_key !== "string" || wire.site_key.trim() === "") return null;
  if (typeof wire.cache_token !== "string" || wire.cache_token.trim() === "") return null;
  if (!isRecord(wire.resource) || typeof wire.resource.type !== "string") return null;
  if (typeof wire.resource.id !== "string" && typeof wire.resource.id !== "number") return null;
  const suppliedRuntime = isRecord(wire.runtime) ? (wire.runtime as Partial<RuntimeConfig>) : undefined;

  return {
    finalizeToken: value.finalize_token,
    connection: {
      version: 1,
      profile,
      origin,
      apiBase,
      siteKey: wire.site_key,
      cacheToken: wire.cache_token,
      resource: { type: wire.resource.type, id: wire.resource.id },
      runtime: runtimeConfig(profile, apiBase, suppliedRuntime, connectedAt),
      pairingId: value.pairing_id,
      connectedAt,
    },
  };
}

function deadline(): AbortSignal | undefined {
  return typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(10_000) : undefined;
}

/** Dynamic, server-only access to one site's private API connection. */
export class SiteConnectionService {
  readonly profile: PairableSiteProfile;
  readonly store: ConnectionStore;
  private readonly options: SiteConnectionOptions;
  private readonly fetcher: typeof fetch;

  constructor(options: SiteConnectionOptions) {
    this.profile = options.profile;
    this.options = options;
    this.store = new ConnectionStore(options);
    this.fetcher = options.fetch ?? fetch;
  }

  current(): SiteConnection | null {
    return this.store.readSync();
  }

  apiBase(): string {
    return this.current()?.apiBase ?? normalizeSecureOrigin(valueOf(this.options.fallbackApiBase)) ?? "";
  }

  siteKey(): string {
    return this.current()?.siteKey ?? valueOf(this.options.fallbackSiteKey);
  }

  cacheToken(): string {
    return this.current()?.cacheToken ?? valueOf(this.options.fallbackCacheToken);
  }

  siteKeyHeaders(): Record<string, string> | undefined {
    const key = this.siteKey();
    return key === "" ? undefined : { "X-TDS-Site-Key": key };
  }

  publicRuntime(): RuntimeConfig {
    const current = this.current();
    if (current) return { ...current.runtime, apiBase: current.apiBase };
    const base = this.apiBase();
    return runtimeConfig(
      this.profile,
      base,
      runtimeOf(this.options.fallbackRuntime),
      (this.options.now ?? (() => new Date()))().toISOString(),
    );
  }

  status(): PublicConnectionStatus {
    const current = this.current();
    return {
      connected: current !== null,
      profile: this.profile,
      origin: current?.origin ?? null,
      api_base: current?.apiBase ?? (this.apiBase() || null),
      resource: current?.resource ?? null,
      connected_at: current?.connectedAt ?? null,
      legacy_environment: current === null && (this.siteKey() !== "" || this.cacheToken() !== ""),
    };
  }

  /** Execute exchange → durable write/verify → finalize, rolling back on failure. */
  async connect(body: ConnectBody, requestOrigin: string): Promise<ConnectResult> {
    const origin = normalizeSecureOrigin(requestOrigin);
    const apiBase = normalizeSecureOrigin(body.api_base);
    if (!origin || !apiBase) throw new ConnectionError("invalid_origin", 422);
    // The fragment is confidential in transit, but it is not an identity for
    // the remote API. Without this anchor an attacker could point the public
    // endpoint at their own HTTPS server, return a valid-looking exchange and
    // replace the real credentials. Trust comes from shipped/host config or
    // the already-established connection, never from request input.
    const trusted = new Set(
      [
        normalizeSecureOrigin(valueOf(this.options.fallbackApiBase)),
        this.current()?.apiBase ?? null,
        ...(this.options.trustedApiBases ?? []).map(normalizeSecureOrigin),
      ].filter((value): value is string => value !== null),
    );
    if (!trusted.has(apiBase)) throw new ConnectionError("untrusted_api_origin", 422);
    if (!/^[A-Za-z0-9_-]{32,512}$/.test(body.pairing_token)) {
      throw new ConnectionError("invalid_pairing_token", 422);
    }

    const exchangeResponse = await this.request(`${apiBase}/sites/pairings/exchange`, {
      pairing_token: body.pairing_token,
      profile: this.profile,
      origin,
    });
    if (!exchangeResponse.ok) throw new ConnectionError("exchange_failed", exchangeResponse.status === 401 || exchangeResponse.status === 410 ? exchangeResponse.status : 502);

    const connectedAt = (this.options.now ?? (() => new Date()))().toISOString();
    const parsed = parseExchange(
      (await exchangeResponse.json().catch(() => null)) as PairingExchangeResponse | null,
      this.profile,
      origin,
      apiBase,
      connectedAt,
    );
    if (!parsed) throw new ConnectionError("invalid_exchange_response", 502);

    const previous = await this.store.read();
    try {
      await this.store.write(parsed.connection);
      const verified = await this.store.read();
      if (
        !verified ||
        verified.pairingId !== parsed.connection.pairingId ||
        verified.siteKey !== parsed.connection.siteKey ||
        verified.cacheToken !== parsed.connection.cacheToken
      ) {
        throw new Error("connection_verification_failed");
      }
    } catch (error) {
      await this.restore(previous);
      throw new ConnectionError("state_write_failed", 500, error);
    }

    let finalized: Response;
    try {
      finalized = await this.request(`${apiBase}/sites/pairings/finalize`, {
        pairing_id: parsed.connection.pairingId,
        finalize_token: parsed.finalizeToken,
        profile: this.profile,
        origin,
      });
    } catch (error) {
      await this.restore(previous);
      throw error;
    }
    if (!finalized.ok) {
      await this.restore(previous);
      throw new ConnectionError("finalize_failed", 502);
    }

    let warning: ConnectResult["warning"];
    try {
      await this.options.onConnected?.(parsed.connection);
    } catch {
      // The connection itself is finalized. Site-specific follow-up work is
      // retryable and must not pretend the credential rollback succeeded.
      warning = "post_connect_failed";
    }

    return {
      connected: true,
      profile: this.profile,
      origin,
      resource: parsed.connection.resource,
      connected_at: connectedAt,
      ...(warning ? { warning } : {}),
    };
  }

  async handleConnect(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const size = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(size) && size > 16_384) return json({ error: "payload_too_large" }, 413);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (!isRecord(body) || typeof body.pairing_token !== "string" || typeof body.api_base !== "string") {
      return json({ error: "invalid_payload" }, 422);
    }
    try {
      return json(await this.connect(body as unknown as ConnectBody, new URL(request.url).origin));
    } catch (error) {
      if (error instanceof ConnectionError) return json({ error: error.code }, error.status);
      return json({ error: "connection_failed" }, 502);
    }
  }

  private async request(url: string, body: unknown): Promise<Response> {
    try {
      return await this.fetcher(url, {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        signal: deadline(),
      });
    } catch (error) {
      throw new ConnectionError("api_unreachable", 502, error);
    }
  }

  private async restore(previous: SiteConnection | null): Promise<void> {
    try {
      if (previous) await this.store.write(previous);
      else await this.store.remove();
    } catch {
      // The original error remains the useful one. A failed rollback is not
      // hidden: the next status call reads the actual file and reports it.
    }
  }
}

export class ConnectionError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    options?: unknown,
  ) {
    super(code, options === undefined ? undefined : { cause: options });
    this.name = "ConnectionError";
  }
}

export function siteConnection(options: SiteConnectionOptions): SiteConnectionService {
  return new SiteConnectionService(options);
}

export function connectionStatusResponse(service: SiteConnectionService): Response {
  return json(service.status());
}

export function runtimeConfigResponse(service: SiteConnectionService): Response {
  return json(service.publicRuntime());
}

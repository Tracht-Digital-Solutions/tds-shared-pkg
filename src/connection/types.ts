import type { RuntimeConfig } from "../api/index.js";

/** Public sites that can be paired with the composed API. */
export type PairableSiteProfile = "blog" | "landingpage" | "tools";

/** The CMS object a public site is connected to. */
export interface ConnectionResource {
  type: string;
  id: string | number;
}

/**
 * The private state stored on the public site's host.
 *
 * `siteKey` and `cacheToken` must never be copied into a response intended for
 * a browser. Keep this type in the server-only `connection` entry point.
 */
export interface SiteConnection {
  version: 1;
  profile: PairableSiteProfile;
  origin: string;
  apiBase: string;
  siteKey: string;
  cacheToken: string;
  resource: ConnectionResource;
  runtime: RuntimeConfig;
  pairingId: string;
  connectedAt: string;
}

/** Wire response returned once by `POST /sites/pairings/exchange`. */
export interface PairingExchangeResponse {
  pairing_id: string;
  finalize_token: string;
  connection: {
    version: 1;
    profile: PairableSiteProfile;
    origin: string;
    api_base: string;
    site_key: string;
    cache_token: string;
    resource: ConnectionResource;
    runtime?: Partial<RuntimeConfig>;
  };
}

/** Public, secret-free status returned by a site's connection endpoint. */
export interface PublicConnectionStatus {
  connected: boolean;
  profile: PairableSiteProfile;
  origin: string | null;
  api_base: string | null;
  resource: ConnectionResource | null;
  connected_at: string | null;
  legacy_environment: boolean;
}


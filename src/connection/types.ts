import type { RuntimeConfig } from "../api/index.js";

/**
 * Public sites that can be paired with the composed API.
 *
 * A runtime array, with the type derived from it — NOT a hand-written union
 * beside a hand-written validator. Those were two lists: adding `shop` to the
 * union type left `store.ts`'s `PROFILE` regex behind, so the site type-checked
 * and built cleanly and then threw `invalid_connection_profile` on its first
 * request. One list cannot drift from itself.
 *
 * Still keep in step with `install/profiles.ts` (the wizard's side) and with
 * `SiteKeyPolicy::KNOWN` in tds-core-frontend-api (the server's side); those
 * genuinely live in other places. `auth` is absent on purpose: it runs the
 * wizard but pairs nothing.
 */
export const PAIRABLE_SITE_PROFILES = ["blog", "landingpage", "tools", "shop"] as const;

export type PairableSiteProfile = (typeof PAIRABLE_SITE_PROFILES)[number];

export function isPairableSiteProfile(value: unknown): value is PairableSiteProfile {
  return (
    typeof value === "string" && (PAIRABLE_SITE_PROFILES as readonly string[]).includes(value)
  );
}

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


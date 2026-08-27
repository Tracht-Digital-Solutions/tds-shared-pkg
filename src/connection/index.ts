/**
 * Server-only public-site connection state and pairing client.
 *
 * This entry imports Node filesystem modules. It is intentionally separate
 * from the package root so no credential code can enter a browser bundle.
 */
export { ConnectionStore, resolveConnectionDirectory } from "./store.js";
export type { ConnectionStoreOptions } from "./store.js";

export {
  ConnectionError,
  SiteConnectionService,
  connectionStatusResponse,
  normalizeSecureOrigin,
  runtimeConfigResponse,
  siteConnection,
} from "./service.js";
export type { ConnectBody, ConnectResult, SiteConnectionOptions } from "./service.js";

export type {
  ConnectionResource,
  PairableSiteProfile,
  PairingExchangeResponse,
  PublicConnectionStatus,
  SiteConnection,
} from "./types.js";


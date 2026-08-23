/**
 * The host-side setup wizard, as a shared React island.
 *
 * Consumed via
 * `import { InstallWizard, profiles } from "@tracht-digital-solutions/tds-shared/install"`
 * from a thin `src/pages/install.astro` in each of the four static sites.
 *
 * It used to be PHP shipped inside this package and copied into `public/` by a
 * `prebuild` step — which could never run, because every frontend subdomain is
 * configured with PHP disabled (`tds-gateway-api/DEPLOY-PLESK.md`). Only
 * `api.tracht-digital.de` executes PHP, and its own installer stays there.
 */

export { default as InstallWizard } from "./InstallWizard.js";
export type { InstallWizardProps } from "./InstallWizard.js";
export {
  auth,
  blog,
  landingpage,
  profiles,
  tools,
  type ProfileId,
  type PublicRoute,
  type SiteProfile,
} from "./profiles.js";
export {
  buildRuntimeConfig,
  countItems,
  diffPublished,
  probeHealth,
  probeRoute,
  readPublishedConfig,
  serializeRuntimeConfig,
  trimUrl,
  type Endpoints,
  type ProbeResult,
  type Reachability,
} from "./checks.js";

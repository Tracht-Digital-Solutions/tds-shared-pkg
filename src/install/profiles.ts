/**
 * Site profiles for the setup wizard — one per deployable static site.
 *
 * These replace the PHP arrays that used to live in `install/profiles/*.php`.
 * The wizard is a browser page now (see `InstallWizard.tsx` for why), so the
 * profiles are plain typed objects: `tsc` checks what `installer.test.ts`
 * previously had to establish by parsing PHP with regexes.
 *
 * This is the ONLY place the four sites differ. Everything else in the wizard
 * is identical for all of them.
 */

import type { RuntimeKey } from "../api/index.js";

/**
 * One assertion in the connection check: a route, and the key whose array
 * length is the answer.
 *
 * The count key is the whole point. Every one of these routes answers `200`
 * with an empty payload when the database is empty or the service is
 * misconfigured, so a status check proves nothing — "12 Blöcke" does.
 */
export interface PublicRoute {
  method: "GET";
  /** Path relative to the probe base, query string included. */
  path: string;
  /**
   * Dotted path to the countable node in the response; its size is reported.
   *
   * A list is counted by length and a map by its keys — the public content
   * routes use both shapes (`posts` is a list, `blocks` and `docs` are maps),
   * and assuming one of them is what made two working routes report
   * "unerwartetes Format". See `countItems`.
   */
  countKey: string;
}

export interface SiteProfile {
  /**
   * Stable slug. Also the `?frontend=` label the live-chat widget identifies
   * itself with, which is why it is not merely cosmetic.
   */
  id: string;
  /** What the wizard shows in its heading. */
  name: string;
  /**
   * Every origin a browser may reach this site on.
   *
   * The wizard can only ever test the one it is loaded on — a page cannot set
   * the `Origin` header — so this list exists to TELL the operator which other
   * origins still need a visit. See `InstallWizard.tsx`.
   */
  origins: string[];
  /** The connection check. */
  publicRoutes: PublicRoute[];
  /**
   * Which base `publicRoutes` resolve against.
   *
   * `"auth"` is the central login site, whose only public route lives on the
   * auth service. Today auth sits under the gateway and the two agree; the day
   * it does not, resolving against the gateway would report a green check for a
   * host this site never calls.
   */
  probeBase: "api" | "auth";
  /**
   * Which keys this site's `tds-runtime.json` carries.
   *
   * Must stay a subset of `RUNTIME_KEYS` in `src/api/index.ts` — the type
   * enforces it, and `installer.test.ts` pins that the generator emits exactly
   * these and nothing else. A key the site does not read is noise; a key it
   * reads and never gets falls back to the baked value silently.
   */
  runtimeKeys: RuntimeKey[];
  /** Whether this SSR site accepts one-time API pairing at `/tds/connect`. */
  pairing: boolean;
}

/** `tracht-digital.de` — the public marketing site. */
export const landingpage: SiteProfile = {
  id: "landingpage",
  name: "Landingpage",
  // `www.` matters: a visitor landing there posts the contact form from a
  // different origin, and a missing Allow-Origin fails silently — the form just
  // never submits. The wizard cannot test both from one page and says so.
  origins: ["https://tracht-digital.de", "https://www.tracht-digital.de"],
  publicRoutes: [
    { method: "GET", path: "/content/landing?lang=de", countKey: "blocks" },
    { method: "GET", path: "/content/blog?limit=3&lang=de", countKey: "posts" },
    { method: "GET", path: "/content/legal", countKey: "docs" },
  ],
  probeBase: "api",
  runtimeKeys: ["apiBase", "contactUrl", "liveChatFrontend"],
  pairing: true,
};

/** `blog.tracht-digital.de`. */
export const blog: SiteProfile = {
  id: "blog",
  name: "Blog",
  origins: ["https://blog.tracht-digital.de"],
  // The blog reads `/content/landing` too, even though it is not the landing
  // page: its cookie-banner switch and AdSense configuration live in that
  // site's content blocks (`src/lib/content-api.ts`). Leaving it out would hide
  // exactly the case where ads and the banner silently vanish.
  //
  // `/content/snippets` is deliberately NOT here, though the blog fetches it.
  // `BlogCmsModule` answers it with a hard-coded `['snippets' => []]` — curated
  // snippets were a `tds-content-api` feature with no port, and the empty shape
  // exists only to keep the build green. So the check could never report
  // anything but "Leer" on a perfectly configured host, which teaches the
  // operator to ignore an empty result on the routes where it means something.
  publicRoutes: [
    { method: "GET", path: "/content/blog?limit=3&lang=de", countKey: "posts" },
    { method: "GET", path: "/content/landing?lang=de", countKey: "blocks" },
  ],
  probeBase: "api",
  runtimeKeys: ["apiBase", "loginUrl", "contactUrl", "liveChatFrontend"],
  pairing: true,
};

/** `tools.tracht-digital.de` — the public tools platform. */
export const tools: SiteProfile = {
  id: "tools",
  name: "Tools",
  origins: ["https://tools.tracht-digital.de"],
  publicRoutes: [{ method: "GET", path: "/tools/catalog", countKey: "tools" }],
  probeBase: "api",
  runtimeKeys: ["apiBase", "loginUrl", "liveChatFrontend"],
  pairing: true,
};

/** `auth.tracht-digital.de` — the central login. */
export const auth: SiteProfile = {
  id: "auth",
  name: "Zentrale Anmeldung",
  origins: ["https://auth.tracht-digital.de"],
  // The one public route of tds-auth-api, and a genuinely diagnostic one:
  // `keys: 0` means `composer keygen` never ran on the API host. Every login
  // then fails signature verification everywhere, while the endpoint still
  // answers a perfectly valid 200.
  publicRoutes: [
    { method: "GET", path: "/.well-known/jwks.json", countKey: "keys" },
  ],
  probeBase: "auth",
  // No `loginUrl` — this site IS the login page, so the key would point at
  // itself.
  runtimeKeys: ["apiBase", "authBase"],
  pairing: false,
};

/** Every profile, by id. Used by the tests; sites import their own by name. */
export const profiles = { landingpage, blog, tools, auth } as const;

export type ProfileId = keyof typeof profiles;

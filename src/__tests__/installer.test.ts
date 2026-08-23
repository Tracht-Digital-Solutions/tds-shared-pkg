import { describe, expect, it } from "vitest";
import { RUNTIME_KEYS } from "../api";
import { buildRuntimeConfig, countItems, diffPublished, serializeRuntimeConfig } from "../install/checks";
import { profiles, type SiteProfile } from "../install/profiles";

/**
 * Parity between the setup wizard's profiles and the runtime config the sites
 * read back.
 *
 * This used to parse `install/profiles/*.php` with regexes, because the wizard
 * was PHP. It is a React island now, so the profiles are typed objects and
 * `tsc` covers the shape. What is left here is the class of mistake a type
 * cannot catch and that has **no other symptom**: a profile that publishes a
 * key the site never reads, or reads a key the generator never emits, produces
 * valid JSON, a green build and a site that quietly ignores everything the
 * operator configured.
 */

const all = Object.entries(profiles) as Array<[string, SiteProfile]>;

const endpoints = {
  apiBase: "https://api.example.test",
  authBase: "https://api.example.test/auth",
  loginUrl: "https://auth.example.test",
};

describe.each(all)("profile %s", (_id, profile) => {
  it("declares an id, a name and at least one https origin", () => {
    expect(profile.id).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(profile.name).toBeTruthy();
    expect(profile.origins.length).toBeGreaterThan(0);
    for (const origin of profile.origins) {
      expect(origin).toMatch(/^https:\/\/[a-z0-9.-]+$/);
      // A trailing slash would break the comparison against
      // `window.location.origin`, which never has one — the wizard would then
      // tell an operator to go and check the origin they are already on.
      expect(origin.endsWith("/")).toBe(false);
    }
  });

  it("uses only runtime keys the TypeScript side knows", () => {
    expect(profile.runtimeKeys.length).toBeGreaterThan(0);
    for (const key of profile.runtimeKeys) expect(RUNTIME_KEYS).toContain(key);
    expect(new Set(profile.runtimeKeys).size).toBe(profile.runtimeKeys.length);
  });

  it("always carries apiBase — everything else resolves against it", () => {
    expect(profile.runtimeKeys).toContain("apiBase");
  });

  it("probes its public routes against a base it also publishes", () => {
    // `probeBase: "auth"` sends the check to the Auth-API-URL instead of the
    // gateway. A profile that does that but never publishes `authBase` would
    // verify one host at install time and have the site call another one
    // forever after.
    expect(["api", "auth"]).toContain(profile.probeBase);
    if (profile.probeBase === "auth") expect(profile.runtimeKeys).toContain("authBase");
  });

  it("smoke-tests real routes with a count key", () => {
    expect(profile.publicRoutes.length).toBeGreaterThan(0);
    for (const route of profile.publicRoutes) {
      expect(route.path.startsWith("/")).toBe(true);
      // The count key is the whole point: these routes answer 200 with an empty
      // payload when the database is empty, so a status check proves nothing.
      expect(route.countKey).toMatch(/^[a-zA-Z][a-zA-Z0-9.]*$/);
    }
  });

  it("generates exactly the keys it declares — no more, no fewer", () => {
    const config = buildRuntimeConfig(profile, endpoints);
    const emitted = Object.keys(config).filter(
      (key) => !["version", "site", "mode", "generatedAt"].includes(key),
    );
    expect(emitted.sort()).toEqual([...profile.runtimeKeys].sort());
    for (const key of profile.runtimeKeys) expect(config[key]).toBeTruthy();
  });
});

describe("across profiles", () => {
  it("site ids are unique — they name the runtime config and the live-chat frontend", () => {
    const ids = all.map(([, profile]) => profile.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a profile that publishes loginUrl is one that can gate content", () => {
    // The auth site is the deliberate exception: it IS the login page, so the
    // key would point at itself.
    expect(profiles.auth.runtimeKeys).not.toContain("loginUrl");
  });
});

describe("buildRuntimeConfig", () => {
  it("strips trailing slashes so no URL is ever built with a double slash", () => {
    const config = buildRuntimeConfig(profiles.blog, {
      apiBase: "https://api.example.test/",
      authBase: "https://api.example.test/auth/",
      loginUrl: "https://auth.example.test/",
    });
    expect(config.apiBase).toBe("https://api.example.test");
    expect(config.contactUrl).toBe("https://api.example.test/contact");
    expect(config.loginUrl).toBe("https://auth.example.test");
  });

  it("always writes direct mode — the same-origin proxy is gone", () => {
    // It needed a server to attach the site token, and the frontend domains run
    // no PHP. A file claiming `proxy` would describe a mode nothing can serve.
    expect(buildRuntimeConfig(profiles.tools, endpoints).mode).toBe("direct");
  });

  it("serializes as pretty JSON with a trailing newline", () => {
    const json = serializeRuntimeConfig(buildRuntimeConfig(profiles.tools, endpoints));
    expect(json.endsWith("\n")).toBe(true);
    expect(JSON.parse(json).site).toBe("tools");
  });
});

describe("countItems", () => {
  it("counts an array at a dotted path", () => {
    expect(countItems({ a: { b: [1, 2, 3] } }, "a.b")).toBe(3);
    expect(countItems({ blocks: [] }, "blocks")).toBe(0);
  });

  it("counts a MAP by its keys — `blocks` and `docs` are not lists", () => {
    // `/content/landing` answers `blocks` as `section_key => value` and
    // `/content/legal` answers `docs` as `key => language map`. Counting only
    // arrays reported both as "unerwartetes Format" on a host serving them
    // perfectly — a red row that sends the operator to fix nothing.
    expect(countItems({ blocks: { hero: {}, pricing: {}, faq: {} } }, "blocks")).toBe(3);
    expect(countItems({ blocks: {} }, "blocks")).toBe(0);
    expect(countItems({ docs: { agb: { de: {}, en: {} } } }, "docs")).toBe(1);
  });

  it("returns null rather than 0 when there is nothing countable there", () => {
    // "unexpected response" and "reachable but empty" are different findings
    // and must not collapse: the first is a broken endpoint, the second is an
    // empty database, and they send an operator to different places.
    expect(countItems({}, "blocks")).toBeNull();
    expect(countItems(null, "blocks")).toBeNull();
    expect(countItems({ blocks: null }, "blocks")).toBeNull();
    expect(countItems({ blocks: "hero" }, "blocks")).toBeNull();
    expect(countItems({ blocks: 3 }, "blocks")).toBeNull();
  });
});

describe("blog profile", () => {
  it("does not probe /content/snippets", () => {
    // The route is a hard-coded empty stub in BlogCmsModule (curated snippets
    // were a tds-content-api feature with no port). Checking it could only ever
    // report "Leer" on a healthy host, which trains the operator to ignore an
    // empty result on the routes where it is a real finding.
    expect(profiles.blog.publicRoutes.map((r) => r.path)).not.toContain("/content/snippets");
  });
});

describe("diffPublished", () => {
  const expected = buildRuntimeConfig(profiles.blog, endpoints);

  it("reports every key when nothing is published yet", () => {
    expect(diffPublished(profiles.blog, expected, null)).toEqual(profiles.blog.runtimeKeys);
  });

  it("ignores generatedAt, which changes on every run", () => {
    // Reporting it would make the confirm step fail every single time and train
    // the operator to ignore the one check that proves the upload worked.
    const actual = { ...expected, generatedAt: "1999-01-01T00:00:00.000Z" };
    expect(diffPublished(profiles.blog, expected, actual)).toEqual([]);
  });

  it("names only the keys that actually differ", () => {
    const actual = { ...expected, contactUrl: "https://old.example.test/contact" };
    expect(diffPublished(profiles.blog, expected, actual)).toEqual(["contactUrl"]);
  });

  it("ignores keys this profile does not publish", () => {
    // The landingpage never writes loginUrl; a stale one left in the file by an
    // earlier profile must not be reported as a mismatch it cannot fix.
    const lp = buildRuntimeConfig(profiles.landingpage, endpoints);
    const actual = { ...lp, loginUrl: "https://somewhere.example.test" };
    expect(diffPublished(profiles.landingpage, lp, actual)).toEqual([]);
  });
});

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RUNTIME_KEYS } from "../api";

/**
 * Parity between the host-side installer and this package's runtime config.
 *
 * `install/install.php` writes `tds-runtime.json`, `install/profiles/*.php`
 * decide which keys each site gets, and `src/api/index.ts` reads them back on
 * the deployed site. Three writers, one contract — the same shape that has bitten
 * this project repeatedly (the gateway's `.env` writers, the three services'
 * `.env.example`s), which is why `tds-gateway-api/scripts/check-env-parity.php`
 * exists. This is its twin for the frontend side.
 *
 * The failure it prevents has NO other symptom: a profile listing `contactURL`
 * instead of `contactUrl` produces a valid JSON file, a green build, a working
 * site — that quietly keeps using its baked URL and ignores everything the
 * operator configured. Like the parity script, this reads the PHP with regexes
 * rather than executing it, so it runs in a plain vitest process with no PHP
 * toolchain (this package has none).
 */

const INSTALL_DIR = join(__dirname, "..", "..", "install");
const PROFILE_DIR = join(INSTALL_DIR, "profiles");

/**
 * Pull `'key' => [ … ]` out of a PHP source by balancing brackets.
 *
 * A plain regex cannot do this: `proxy_allow` holds nested arrays, so the first
 * `]` is not the end of the value.
 */
function phpArrayValue(source: string, key: string): string | null {
  const start = source.indexOf(`'${key}' => [`);
  if (start === -1) return null;
  let depth = 0;
  for (let i = source.indexOf("[", start); i < source.length; i += 1) {
    if (source[i] === "[") depth += 1;
    else if (source[i] === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(source.indexOf("[", start) + 1, i);
    }
  }
  return null;
}

/** A capture group as a plain string — regex groups are optional to TypeScript. */
const group = (match: RegExpMatchArray, index: number): string => match[index] ?? "";

/** Every single-quoted string inside a PHP array literal, in order. */
function phpStrings(fragment: string): string[] {
  return [...fragment.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => group(m, 1).replace(/\\'/g, "'"));
}

/** A scalar `'key' => 'value'` / `'key' => true|false`. */
function phpScalar(source: string, key: string): string | null {
  const match = source.match(new RegExp(`'${key}'\\s*=>\\s*(?:'((?:[^'\\\\]|\\\\.)*)'|(true|false))`));
  if (match === null) return null;
  return match[1] ?? match[2] ?? null;
}

/** `[method, pattern]` pairs — the proxy allowlist. */
function proxyPairs(fragment: string): Array<{ method: string; pattern: string }> {
  return [...fragment.matchAll(/\[\s*'([A-Z]+)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\]/g)].map((m) => ({
    method: group(m, 1),
    // PHP escapes a single quote as \' inside single quotes; nothing else.
    pattern: group(m, 2).replace(/\\'/g, "'"),
  }));
}

/** `[method, path, countKey]` triples — the content smoke test. */
function routeTriples(fragment: string): Array<{ method: string; path: string; countKey: string }> {
  return [
    ...fragment.matchAll(/\[\s*'([A-Z]+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\]/g),
  ].map((m) => ({ method: group(m, 1), path: group(m, 2), countKey: group(m, 3) }));
}

/** Translate a PHP `#…#` delimited PCRE into a JS RegExp. */
function toJsRegExp(phpPattern: string): RegExp {
  const delimiter = phpPattern[0] ?? "#";
  const end = phpPattern.lastIndexOf(delimiter);
  const body = phpPattern.slice(1, end);
  const flags = phpPattern.slice(end + 1).replace(/[^gimsuy]/g, "");
  return new RegExp(body, flags);
}

const profileFiles = readdirSync(PROFILE_DIR).filter((f) => f.endsWith(".php"));
const profiles = profileFiles.map((file) => ({
  file,
  source: readFileSync(join(PROFILE_DIR, file), "utf8"),
}));

describe("installer files", () => {
  it("ships the wizard, the proxy and at least the three site profiles", () => {
    const entries = readdirSync(INSTALL_DIR);
    expect(entries).toContain("install.php");
    expect(entries).toContain("proxy.php");
    expect(profileFiles.sort()).toEqual(["blog.php", "landingpage.php", "tools.php"]);
  });

  it("is declared in package.json files, or npm would not publish it", () => {
    // The sites copy the installer out of node_modules at build time. Left out
    // of `files`, everything below still passes and `_setup/` is simply empty
    // on every deployed host.
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"),
    ) as { files: string[] };
    expect(pkg.files).toContain("install");
  });
});

describe.each(profiles)("profile $file", ({ source }) => {
  it("declares an id, a name and at least one https origin", () => {
    expect(phpScalar(source, "id")).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(phpScalar(source, "name")).toBeTruthy();

    const origins = phpStrings(phpArrayValue(source, "origins") ?? "");
    expect(origins.length).toBeGreaterThan(0);
    for (const origin of origins) {
      expect(origin).toMatch(/^https:\/\/[a-z0-9.-]+$/);
      // A trailing slash makes the preflight comparison fail against an
      // Access-Control-Allow-Origin that never has one.
      expect(origin.endsWith("/")).toBe(false);
    }
  });

  it("uses only runtime keys the TypeScript side knows", () => {
    const keys = phpStrings(phpArrayValue(source, "runtime_keys") ?? "");
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(RUNTIME_KEYS).toContain(key);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("always carries apiBase — everything else resolves against it", () => {
    expect(phpStrings(phpArrayValue(source, "runtime_keys") ?? "")).toContain("apiBase");
  });

  it("smoke-tests real routes with a count key", () => {
    const routes = routeTriples(phpArrayValue(source, "public_routes") ?? "");
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(route.path.startsWith("/")).toBe(true);
      // The count key is the whole point: these routes answer 200 with an empty
      // payload when the database is empty, so a status check proves nothing.
      expect(route.countKey).toMatch(/^[a-zA-Z][a-zA-Z0-9.]*$/);
    }
  });

  it("has a proxy allowlist of valid patterns, anchored at both ends", () => {
    const pairs = proxyPairs(phpArrayValue(source, "proxy_allow") ?? "");
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      expect(() => toJsRegExp(pair.pattern)).not.toThrow();
      // Unanchored, `#/contact#` would also match `/admin/contacts`. The
      // allowlist is the proxy's only security boundary; a loose pattern in it
      // is the whole failure mode.
      expect(pair.pattern).toContain("^");
      expect(pair.pattern).toContain("$");
    }
  });

  it("never exposes an admin or settings route through the proxy", () => {
    const pairs = proxyPairs(phpArrayValue(source, "proxy_allow") ?? "");
    for (const pair of pairs) {
      const regex = toJsRegExp(pair.pattern);
      for (const forbidden of [
        "/admin/settings/tools",
        "/admin/users",
        "/me",
        "/wiki.json",
        "/tools/registry",
        "/tools/stripe-webhook",
      ]) {
        expect(
          regex.test(forbidden),
          `${pair.method} ${pair.pattern} must not match ${forbidden}`,
        ).toBe(false);
      }
    }
  });

  it("has a proxy probe the allowlist actually permits", () => {
    // verify_proxy calls this path through the freshly written proxy. If the
    // allowlist does not permit it the proxy answers 404 and the wizard reports
    // a broken install that is in fact fine.
    const probe = phpScalar(source, "proxy_probe");
    expect(probe).toBeTruthy();
    const path = (probe ?? "").split("?")[0] ?? "";
    const allowed = proxyPairs(phpArrayValue(source, "proxy_allow") ?? "")
      .filter((pair) => pair.method === "GET")
      .some((pair) => toJsRegExp(pair.pattern).test(path));
    expect(allowed, `proxy_probe ${path} is not in proxy_allow`).toBe(true);
  });
});

describe("across profiles", () => {
  it("site ids are unique — they name the runtime config and the rate-limit bucket", () => {
    const ids = profiles.map(({ source }) => phpScalar(source, "id"));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a profile that can probe the session also knows where to send a stranger", () => {
    // The account menu needs both halves: `GET /auth/me` to discover a session
    // and `loginUrl` to offer one to a visitor who has none. Half of that pair
    // fails silently — the probe 404s through the proxy, or the sign-in link
    // quietly falls back to the baked default and ignores the host entirely.
    for (const { file, source } of profiles) {
      const probesSession = proxyPairs(phpArrayValue(source, "proxy_allow") ?? "")
        .filter((pair) => pair.method === "GET")
        .some((pair) => toJsRegExp(pair.pattern).test("/auth/me"));
      if (!probesSession) continue;

      expect(
        phpStrings(phpArrayValue(source, "runtime_keys") ?? ""),
        `${file} proxies /auth/me but does not carry loginUrl`,
      ).toContain("loginUrl");
    }
  });

  it("install.php can supply every key a profile may request", () => {
    // The third writer. `runtime_config()` builds an `$all` map and the profile
    // picks from it; a key present in a profile but missing there silently
    // writes an empty string.
    const installSource = readFileSync(join(INSTALL_DIR, "install.php"), "utf8");
    const allMap = installSource.slice(
      installSource.indexOf("$all = ["),
      installSource.indexOf("];", installSource.indexOf("$all = [")),
    );
    const supplied = [...allMap.matchAll(/'([a-zA-Z]+)'\s*=>/g)].map((m) => group(m, 1));

    for (const key of RUNTIME_KEYS) {
      expect(supplied, `install.php does not build ${key}`).toContain(key);
    }
    for (const { file, source } of profiles) {
      for (const key of phpStrings(phpArrayValue(source, "runtime_keys") ?? "")) {
        expect(supplied, `${file} wants ${key}, install.php does not build it`).toContain(key);
      }
    }
  });

  it("the proxy reads secrets exactly the way the installer writes them", () => {
    // env_line() escapes \, " and $ — phpdotenv interpolates ${VAR} inside
    // double quotes, so an unescaped $ in a pasted token is silently rewritten.
    // Both readers must undo the same three, or a token containing one of them
    // is forwarded wrong and rejected upstream with a 401 that points nowhere.
    const proxySource = readFileSync(join(INSTALL_DIR, "proxy.php"), "utf8");
    const installSource = readFileSync(join(INSTALL_DIR, "install.php"), "utf8");
    const unescape = `str_replace(['\\\\\\\\', '\\\\"', '\\\\$'], ['\\\\', '"', '$']`;

    expect(proxySource).toContain(unescape);
    expect(installSource).toContain(unescape);
  });
});

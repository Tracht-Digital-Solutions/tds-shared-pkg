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

/**
 * Whether a profile offers the same-origin proxy at all.
 *
 * `proxy => false` is not a preference: `proxy.php` drops `Set-Cookie` by
 * design, so on a site that signs people in the proxy would answer 200 and
 * start no session. Every proxy-shaped rule below has to skip those profiles,
 * or they fail for having correctly declared nothing.
 */
const proxyEnabled = (source: string): boolean => phpScalar(source, "proxy") !== "false";

const profileFiles = readdirSync(PROFILE_DIR).filter((f) => f.endsWith(".php"));
const profiles = profileFiles.map((file) => ({
  file,
  source: readFileSync(join(PROFILE_DIR, file), "utf8"),
}));

describe("installer files", () => {
  it("ships the wizard, the proxy, the .htaccess and every site profile", () => {
    const entries = readdirSync(INSTALL_DIR);
    expect(entries).toContain("install.php");
    expect(entries).toContain("proxy.php");
    // Stored without the leading dot and renamed by `sync-installer.mjs`.
    // It carries the `DirectoryIndex index.php` that makes `/install/`
    // resolve to the wizard at all — DirectoryIndex is inherited from the
    // docroot, and the landingpage's own .htaccess sets it to index.html.
    // Without this file the deployed wizard answers 403, and nothing in the
    // build or the tests would have said so.
    expect(entries).toContain("htaccess");
    expect(profileFiles.sort()).toEqual([
      "auth.php",
      "blog.php",
      "landingpage.php",
      "tools.php",
    ]);
  });

  it("ships an Apache config that makes /install/ resolve to the wizard", () => {
    const htaccess = readFileSync(join(INSTALL_DIR, "htaccess"), "utf8");
    // The whole routing contract lives in this one line and nothing else can
    // see it: the landingpage's docroot .htaccess declares
    // `DirectoryIndex index.html` globally, so without the override Apache
    // finds no index in install/ and answers 403.
    expect(htaccess).toMatch(/^\s*DirectoryIndex\s+index\.php\s*$/m);
    // The state files carry no extension Apache denies by default —
    // `.tds-site-installed` was served as plain text under the old layout.
    expect(htaccess).toContain("tds-site-secrets.php");
    expect(htaccess).toContain(".tds-");
  });

  it("never writes install/.htaccess at runtime", () => {
    // write_secrets used to drop a blanket `Require all denied` into the setup
    // directory. Under the directory layout that overwrites the DirectoryIndex
    // above and 403s every remaining task of the run that wrote it — including
    // the one that sets the lock.
    // Scoped to $installDir on purpose: write_proxy legitimately writes
    // <docroot>/api/.htaccess (the /api/* rewrite), and a blanket ban on the
    // string would forbid that too.
    const src = readFileSync(join(INSTALL_DIR, "install.php"), "utf8");
    expect(src).not.toMatch(/file_put_contents\(\s*\$installDir\s*\.\s*'\/\.htaccess'/);
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

  it("probes its public routes against a base it also configures", () => {
    // `probe_base: 'auth'` sends the content smoke test to the Auth-API-URL
    // instead of the gateway. A profile that does that but never writes
    // `authBase` would check one host at install time and have the site call
    // another one forever after.
    const base = phpScalar(source, "probe_base");
    if (base === null) return;
    expect(["api", "auth"]).toContain(base);
    if (base === "auth") {
      expect(phpStrings(phpArrayValue(source, "runtime_keys") ?? "")).toContain("authBase");
    }
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
    if (!proxyEnabled(source)) {
      // A site that forbids the proxy must not carry an allowlist anyway: a
      // list nothing reads is a standing invitation to conclude the proxy is
      // available here, which is the one wrong conclusion on a login site.
      expect(pairs).toEqual([]);
      expect(phpScalar(source, "proxy_probe")).toBeNull();
      return;
    }
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
    if (!proxyEnabled(source)) return;
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

  it("install.php REFUSES the proxy server-side, not just in the form", () => {
    // A `disabled` radio is a hint to a browser, not a constraint on a POST.
    // The auth profile's entire reason for the key is that a hand-built
    // `mode=proxy` would produce a login that reports success and ends nothing,
    // so the refusal has to be in PHP.
    //
    // This asserts the key is READ, not merely declared. That distinction is
    // not hypothetical here: `PermissionResolver` was registered in the
    // container and injected nowhere for a whole release, and nothing was red
    // because nothing looked.
    const src = readFileSync(join(INSTALL_DIR, "install.php"), "utf8");
    const reads = src.match(/\$profile\['proxy'\]\s*\?\?\s*true/g) ?? [];
    // Two: the $canProxy that paints the form, and the clamp on the step-3 POST.
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(src).toContain("$proxyAllowedHere");
  });

  it("install.php reads cors_probe with /contact as the documented default", () => {
    const src = readFileSync(join(INSTALL_DIR, "install.php"), "utf8");
    expect(src).toMatch(/\$profile\['cors_probe'\]\s*\?\?\s*\['POST',\s*'\/contact'\]/);
  });

  it("install.php resolves public_routes against the profile's probe_base", () => {
    const src = readFileSync(join(INSTALL_DIR, "install.php"), "utf8");
    expect(src).toMatch(/\$profile\['probe_base'\]\s*\?\?\s*'api'/);
    // The smoke test must use the resolved base, not the raw gateway one —
    // otherwise the key parses, the test passes and the check still hits the
    // wrong host.
    expect(src).toContain("http_request($probeBase . $path");
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

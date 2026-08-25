/**
 * The release spine — `scripts/pack-release.mjs` + `scripts/app.cjs` — is
 * consumed by PATH, not by specifier:
 *
 *     node node_modules/@tracht-digital-solutions/tds-shared/scripts/pack-release.mjs
 *
 * Nothing in TypeScript, in tsup or in any consumer's build refers to these two
 * files, so every ordinary gate in this repo is blind to them. What is not
 * blind is a consumer's deploy: drop them from `files` and every panel product
 * fails its postbuild with a bare MODULE_NOT_FOUND naming a path inside
 * node_modules, a long way from this package.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("release scripts", () => {
  it("publishes the scripts directory", () => {
    expect(pkg.files).toContain("scripts");
  });

  it("ships both halves of the spine", () => {
    expect(existsSync(join(root, "scripts/pack-release.mjs"))).toBe(true);
    expect(existsSync(join(root, "scripts/app.cjs"))).toBe(true);
  });

  it("resolves the project root from the CONSUMER's cwd", () => {
    // Deriving it from `import.meta.url` — which is what the per-site copies
    // did — resolves to `node_modules/@tracht-digital-solutions/` once the
    // script is published, so it would read tds-shared's own package.json and
    // report a missing `tds.release` section for a consumer that has one.
    const src = read("scripts/pack-release.mjs");
    expect(src).toMatch(/const root = process\.cwd\(\)/);
    expect(src).not.toMatch(/const root = resolve\(dirname\(fileURLToPath/);
  });

  it("falls back to the packaged startup file when the consumer has none", () => {
    // The panel products are composition repos with no application source at
    // all — no `src/`, and no `app.cjs` either. The three public sites keep
    // theirs, so the lookup has to try the consumer first.
    const src = read("scripts/pack-release.mjs");
    expect(src).toMatch(/existsSync\(join\(root, "app\.cjs"\)\)/);
    expect(src).toMatch(/fileURLToPath\(new URL\("app\.cjs", import\.meta\.url\)\)/);
  });

  it("keeps the startup file CommonJS", () => {
    // Passenger loads the app with `require(startupFile)`. A static `import`
    // makes the file ESM, and `require` of ESM throws ERR_REQUIRE_ESM — which
    // Passenger shows as its generic error page, with the cause only in the
    // app log. A dynamic `import(...)` is fine and is how it loads the server.
    const src = read("scripts/app.cjs");
    expect(src).not.toMatch(/^\s*import\s+[\w{*]/m);
    expect(src).toMatch(/import\(".\/server\/entry\.mjs"\)/);
  });
});

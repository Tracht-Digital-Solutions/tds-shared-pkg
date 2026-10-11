import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The component barrel is hydrated on every page of every site (Astro loads an
 * island through its module's whole namespace), so whatever a component
 * imports as a VALUE ships everywhere. `ProductCard` once took `displayPrice`
 * from `../schemas/shopBlocks` and put zod (85 KB) on every page with a theme
 * toggle (0.54). Types are erased and harmless; values from a schema module
 * are not.
 */
const dir = join(__dirname, "../components");
const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));

describe("the component barrel stays light", () => {
  it.each(files)("%s takes no value from a zod schema module", (file) => {
    const source = readFileSync(join(dir, file), "utf8");
    for (const match of source.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']*schemas[^"']*)["']/g)) {
      const [, typeOnly, names, from] = match;
      if (typeOnly || from!.endsWith("/shopPrice")) continue;
      const values = names!
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name && !name.startsWith("type "));
      expect(values, `${file} imports values from ${from}`).toEqual([]);
    }
  });
});

describe("islands have entries of their own", () => {
  // A site hydrating an island from `./components` ships the whole barrel;
  // from `./islands/<name>` it ships that island. Each entry exports exactly
  // one value, or it becomes a second barrel.
  const islands = join(__dirname, "../islands");
  it.each(readdirSync(islands))("%s exports one component", (file) => {
    const source = readFileSync(join(islands, file), "utf8");
    const values = [...source.matchAll(/^export \{([^}]*)\} from/gm)].flatMap((m) => m[1]!.split(","));
    expect(values).toHaveLength(1);
    const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8"));
    expect(pkg.exports[`./islands/${file.replace(/\.ts$/, "")}`]).toBeDefined();
  });
});

describe("fonts are never inlined", () => {
  it("keeps font files out of data: URIs and leaves other assets to Vite", async () => {
    const { tdsViteBuild } = await import("../astro");
    expect(tdsViteBuild.assetsInlineLimit("/x/lato-latin-ext-400-normal.woff")).toBe(false);
    expect(tdsViteBuild.assetsInlineLimit("/x/lato-latin-400-normal.woff2")).toBe(false);
    expect(tdsViteBuild.assetsInlineLimit("/x/icon.svg")).toBeUndefined();
  });
});

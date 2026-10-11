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

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `/consent/store` must stay importable without React.
 *
 * The consumers that need it are precisely the ones that must not ship a UI
 * framework: an inline script deciding whether to inject an ad tag, a plain-TS
 * module upgrading a gated embed. `/consent` cannot serve them — it re-exports
 * the components, so its bundle imports React on line one, and whether that
 * gets tree-shaken away is the consumer's bundler's business rather than a
 * promise this package can make.
 *
 * The check walks the import graph from the source rather than reading `dist`,
 * for two reasons: the assertion should hold whether or not a build has run,
 * and a graph walk names the file that introduced the dependency instead of
 * reporting that a bundle got bigger.
 */
const here = dirname(fileURLToPath(import.meta.url));

/** Relative import specifiers in a module, without the type-only ones. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specs: string[] = [];
  // `import … from "x"`, `export … from "x"`, and bare `import "x"`.
  for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g)) {
    specs.push(m[1] as string);
  }
  for (const m of source.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)) {
    specs.push(m[1] as string);
  }
  return specs;
}

function resolveLocal(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(from), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      /* next */
    }
  }
  return null;
}

/** Every module reachable from `entry`, plus every bare specifier seen. */
function graph(entry: string): { files: string[]; bare: Set<string> } {
  const seen = new Set<string>();
  const bare = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);

    for (const spec of importsOf(file)) {
      const local = resolveLocal(file, spec);
      if (local === null) {
        bare.add(spec);
        continue;
      }
      queue.push(local);
    }
  }

  return { files: [...seen], bare };
}

describe("the consent store entry point", () => {
  const entry = resolve(here, "../consent/store.ts");

  it("reaches no React module, however indirectly", () => {
    const { bare, files } = graph(entry);
    const react = [...bare].filter((s) => s === "react" || s.startsWith("react/") || s === "react-dom");

    expect(
      react,
      `React reached from the store entry. Files in the graph:\n${files.join("\n")}`,
    ).toEqual([]);
  });

  it("pulls in no dependency at all", () => {
    // Not a style preference: this module is imported by inline scripts that
    // run before anything else on the page. Anything it drags in is loaded on
    // every page view of every site that gates a tag.
    const { bare } = graph(entry);
    expect([...bare]).toEqual([]);
  });

  it("still exports what a gating script needs", async () => {
    const store = await import("../consent/store");
    for (const name of ["consentGranted", "readConsent", "onConsentChange", "CONSENT_EVENT"]) {
      expect(store, `missing ${name}`).toHaveProperty(name);
    }
  });
});

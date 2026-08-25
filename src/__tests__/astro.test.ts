import { describe, expect, it } from "vitest";
import { cssTarget, tdsViteBuild, themeBootstrapScript } from "../astro";
import { THEME_ATTRIBUTE, THEME_STORAGE_KEY } from "../design";

/**
 * `cssTarget` is the one build setting every frontend MUST share: it pins
 * the lightningcss browser floor so the frosted `.brand-header` keeps its
 * `-webkit-backdrop-filter` prefix in Safari. A regression here is silent
 * in the browser (no error, no other test), so guard the exact contract.
 * See tds-shared#10 and the note in src/astro/index.ts.
 */
describe("cssTarget", () => {
  it("includes a Safari target so lightningcss keeps the -webkit- prefix", () => {
    const hasSafari = cssTarget.some((t) => t.startsWith("safari"));
    expect(hasSafari, `cssTarget=${cssTarget.join(",")}`).toBe(true);
  });

  it("pins the Safari floor at <=15 (older than the unprefixed-only cutoff)", () => {
    const safari = cssTarget.find((t) => t.startsWith("safari"));
    expect(safari).toBeDefined();
    const version = Number(safari!.replace("safari", ""));
    expect(version).toBeLessThanOrEqual(15);
  });

  it("covers the other evergreen engines so they aren't over-prefixed", () => {
    expect(cssTarget).toEqual(
      expect.arrayContaining(["chrome90", "edge90", "firefox103", "safari15"]),
    );
  });

  it("is a list of non-empty browser-version strings", () => {
    expect(cssTarget.length).toBeGreaterThan(0);
    for (const t of cssTarget) {
      expect(typeof t).toBe("string");
      expect(t).toMatch(/^[a-z]+\d+$/);
    }
  });
});

describe("tdsViteBuild", () => {
  it("selects the lightningcss minifier (the one that reads cssTarget)", () => {
    expect(tdsViteBuild.cssMinify).toBe("lightningcss");
  });

  it("forwards the shared cssTarget array by reference", () => {
    expect(tdsViteBuild.cssTarget).toBe(cssTarget);
  });

  it("is a spreadable vite.build fragment (only known keys)", () => {
    expect(Object.keys(tdsViteBuild).sort()).toEqual(["cssMinify", "cssTarget"]);
  });
});

/**
 * The no-flash theme bootstrap. It used to be three hand-copied inline
 * scripts (landingpage / blog / frontend host); it is now one exported
 * string injected with `set:html`.
 *
 * Two classes of regression are silent in the browser — the theme still
 * "works", it just flashes the wrong colour for one frame on every load —
 * so both are pinned here:
 *   1. the string stops being safe to inject raw (unresolved interpolation,
 *      a `</script>` sequence), and
 *   2. it drifts from the key `ThemeToggle` writes.
 *
 * Rather than assert on the source text alone, the behaviour cases below
 * actually EXECUTE the script against hand-rolled globals — that also
 * covers the `localStorage`-throws path, which is awkward to force in jsdom.
 */
describe("themeBootstrapScript", () => {
  /** Run the bootstrap with fake globals; returns the attribute it set. */
  function run(opts: {
    stored?: string | null;
    storageThrows?: boolean;
    prefersDark?: boolean;
    noMatchMedia?: boolean;
  }): {
    attr: string | null;
    name: string | null;
    /** Fire `astro:before-swap` with an incoming document and report its root. */
    swap: () => { attr: string | null; name: string | null };
  } {
    let attr: string | null = null;
    let name: string | null = null;
    const listeners = new Map<string, (event: unknown) => void>();
    const documentStub = {
      documentElement: {
        setAttribute(key: string, value: string) {
          name = key;
          attr = value;
        },
      },
      addEventListener(type: string, handler: (event: unknown) => void) {
        listeners.set(type, handler);
      },
    };
    const localStorageStub = {
      getItem(key: string) {
        if (opts.storageThrows) throw new Error("storage disabled");
        return key === THEME_STORAGE_KEY ? (opts.stored ?? null) : null;
      },
    };
    const windowStub = opts.noMatchMedia
      ? {}
      : { matchMedia: (q: string) => ({ matches: !!opts.prefersDark && q.includes("dark") }) };

    // eslint-disable-next-line no-new-func
    new Function("window", "document", "localStorage", themeBootstrapScript)(
      windowStub,
      documentStub,
      localStorageStub,
    );
    const swap = () => {
      let swapped: string | null = null;
      let swappedName: string | null = null;
      listeners.get("astro:before-swap")?.({
        newDocument: {
          documentElement: {
            setAttribute(key: string, value: string) {
              swappedName = key;
              swapped = value;
            },
          },
        },
      });
      return { attr: swapped, name: swappedName };
    };
    return { attr, name, swap };
  }

  it("is safe to inject raw — no unresolved interpolation, no </script>", () => {
    // A leftover `${` or backtick would mean the template never resolved and
    // the emitted script is a syntax error (the CLAUDE.md raw-body trap).
    expect(themeBootstrapScript).not.toContain("${");
    expect(themeBootstrapScript).not.toContain("`");
    // Would terminate the host <script> element early.
    expect(themeBootstrapScript.toLowerCase()).not.toContain("</script");
  });

  it("is a self-invoking statement (leaks no globals into the page)", () => {
    expect(themeBootstrapScript.trimStart().startsWith("(function")).toBe(true);
    expect(themeBootstrapScript.trimEnd().endsWith("})();")).toBe(true);
  });

  it("reads the same storage key ThemeToggle writes", () => {
    expect(themeBootstrapScript).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
  });

  it("writes the attribute base.css selects on", () => {
    expect(run({ stored: "dark" }).name).toBe(THEME_ATTRIBUTE);
  });

  it("lets a stored choice win over the OS preference", () => {
    expect(run({ stored: "dark", prefersDark: false }).attr).toBe("dark");
    expect(run({ stored: "light", prefersDark: true }).attr).toBe("light");
  });

  it("follows the OS when nothing is stored", () => {
    expect(run({ stored: null, prefersDark: true }).attr).toBe("dark");
    expect(run({ stored: null, prefersDark: false }).attr).toBe("light");
  });

  it("ignores a corrupt stored value and falls back to the OS", () => {
    expect(run({ stored: "chartreuse", prefersDark: true }).attr).toBe("dark");
    expect(run({ stored: "", prefersDark: false }).attr).toBe("light");
  });

  it("survives localStorage throwing (Safari private mode / cookies off)", () => {
    expect(() => run({ storageThrows: true })).not.toThrow();
    expect(run({ storageThrows: true, prefersDark: true }).attr).toBe("dark");
  });

  it("survives a missing matchMedia and still commits a theme", () => {
    expect(run({ stored: null, noMatchMedia: true }).attr).toBe("light");
  });

  it("re-applies the theme onto the INCOMING document before a router swap", () => {
    // Astro's ClientRouter clears every attribute from <html> and copies the
    // new document's back, so a data-theme set at load time is gone after the
    // first client-side navigation. Writing it onto `newDocument` before the
    // swap is what makes the copy bring it along — without this the panel
    // flips to light on the first click.
    const swapped = run({ stored: "dark" }).swap();
    expect(swapped.name).toBe(THEME_ATTRIBUTE);
    expect(swapped.attr).toBe("dark");
  });

  it("registers exactly one swap listener, on `astro:before-swap`", () => {
    // `astro:after-swap` would also work but paints one frame of the wrong
    // theme first, which is the flash this whole script exists to prevent.
    expect(themeBootstrapScript).toContain('addEventListener("astro:before-swap"');
    expect(themeBootstrapScript).not.toContain("astro:after-swap");
  });
});

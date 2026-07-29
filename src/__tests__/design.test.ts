import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATEGORICAL_CHIP_VARIANTS,
  CHIP_VARIANTS,
  SEMANTIC_CHIP_VARIANTS,
  SURFACES,
  isKnownChipColor,
  resolveChipVariant,
} from "../design";

/**
 * Guards the design library's structural contracts. Every failure mode
 * covered here is SILENT in the browser — a missing surface token just
 * makes a `var()` fall back to nothing, and an unresolved chip variant
 * renders a pill with no colour. None of it throws, so nothing else would
 * catch it.
 */

const STYLES = join(__dirname, "..", "..", "styles");
const read = (p: string) => readFileSync(join(STYLES, p), "utf8");

/** Strip CSS comments so prose in a docblock never counts as a match. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const base = stripComments(read("base.css"));
const primitives = stripComments(read("primitives.css"));
const prose = stripComments(read("prose.css"));
const app = stripComments(read("app.css"));
const surfaceCss = Object.fromEntries(
  SURFACES.map((s) => [s, stripComments(read(`surfaces/${s}.css`))]),
) as Record<(typeof SURFACES)[number], string>;

/** Component-geometry tokens the surface layers are allowed to flip. */
const GEOMETRY_TOKENS = [
  "--tds-radius-btn",
  "--tds-radius-chip",
  "--tds-radius-badge",
  "--tds-radius-input",
  "--tds-radius-card",
  "--tds-radius-alert",
  "--tds-radius-bar",
] as const;

describe("surface token scale", () => {
  it("declares every component-geometry token in base.css", () => {
    for (const token of GEOMETRY_TOKENS) {
      expect(base, `${token} missing from base.css`).toContain(`${token}:`);
    }
  });

  it("declares the elevation, motion and display-type tokens", () => {
    for (const token of [
      "--tds-elevation-card",
      "--tds-elevation-raised",
      "--tds-shadow-sm",
      "--tds-shadow-md",
      "--tds-shadow-lg",
      "--tds-ease-out",
      "--tds-ease-in-out",
      "--tds-dur-fast",
      "--tds-dur-base",
      "--tds-dur-slow",
      "--tds-weight-display",
      "--tds-tracking-display",
      "--tds-leading-display",
      "--tds-eyebrow-family",
      "--tds-eyebrow-weight",
    ]) {
      expect(base, `${token} missing from base.css`).toContain(`${token}:`);
    }
  });

  it("keeps the geometry scale OUT of the `@theme inline` block", () => {
    // `@theme inline` substitutes literal values into Tailwind's generated
    // utilities, which makes a token impossible to override further down
    // the cascade — a `[data-surface]` layer would never be seen. The
    // geometry scale must therefore live in a plain `:root` block.
    const themeBlock = base.slice(
      base.indexOf("@theme inline"),
      base.indexOf("}", base.indexOf("--font-mono")),
    );
    for (const token of GEOMETRY_TOKENS) {
      expect(
        themeBlock.includes(`${token}:`),
        `${token} must not be declared inside @theme inline`,
      ).toBe(false);
    }
  });

  it("keeps --font-mono the last declaration in `@theme inline`", () => {
    // The test above locates the end of the @theme block by searching for the
    // first `}` AFTER --font-mono. That is only the real end of the block
    // while --font-mono is last: append a colour token after it and the slice
    // silently shrinks, so the geometry-token check passes vacuously and a
    // token wrongly placed in @theme inline would sail through. Adding new
    // colour tokens BEFORE --font-mono keeps both tests honest.
    const monoIdx = base.indexOf("--font-mono");
    const blockEnd = base.indexOf("}", monoIdx);
    const tail = base.slice(monoIdx + "--font-mono".length, blockEnd);
    expect(tail, "a declaration follows --font-mono inside @theme inline").not.toMatch(
      /--[a-z]/,
    );
  });

  it("aliases --color-border to --color-line", () => {
    // 27 call sites across 8 repos write `var(--color-border)`. Before the
    // alias existed the token resolved to nothing and every one of those
    // borders silently fell back to `currentColor`.
    expect(base).toMatch(/--color-border:\s*var\(--color-line\)/);
  });
});

describe.each(SURFACES)("surfaces/%s.css", (surface) => {
  const css = () => surfaceCss[surface];

  it("scopes to the bare [data-surface] attribute, not :root", () => {
    // Attribute-scoping (not `:root[data-surface=…]`) is what lets one
    // surface nest inside another — the blog-CMS markdown preview renders a
    // blog surface inside a panel surface.
    expect(css()).toContain(`[data-surface="${surface}"]`);
    expect(css()).not.toContain(`:root[data-surface="${surface}"]`);
  });

  it("only ever sets custom properties (no component rules)", () => {
    // A surface layer is a token layer. If it starts declaring components,
    // the three variations begin diverging again.
    const declarations = css()
      .split("{")
      .slice(1)
      .join("{")
      .split(/[;{}]/)
      .map((d) => d.trim())
      .filter((d) => d.includes(":"));
    expect(declarations.length).toBeGreaterThan(0);
    for (const decl of declarations) {
      expect(decl, `non-token declaration in surfaces/${surface}.css`).toMatch(
        /^--/,
      );
    }
  });

  it("references only tokens that base.css defines", () => {
    const referenced = [...css().matchAll(/var\((--tds-[a-z-]+)/g)].map(
      (m) => m[1],
    );
    for (const token of referenced) {
      expect(base, `${token} referenced but not defined in base.css`).toContain(
        `${token}:`,
      );
    }
  });
});

describe("surface character", () => {
  it("gives the blog a fully flat kit (every radius collapses)", () => {
    for (const token of GEOMETRY_TOKENS) {
      expect(surfaceCss.blog, `blog must flatten ${token}`).toContain(token);
    }
    expect(surfaceCss.blog).toMatch(/--tds-elevation-card:\s*none/);
  });

  it("gives marketing the pill button and the only card elevation", () => {
    expect(surfaceCss.marketing).toMatch(
      /--tds-radius-btn:\s*var\(--tds-radius-pill\)/,
    );
    expect(surfaceCss.marketing).toMatch(/--tds-elevation-card:\s*var\(--tds-shadow/);
  });

  it("gives the panel the 0.75rem chip AGENTS.md always specified", () => {
    expect(surfaceCss.panel).toMatch(/--tds-radius-chip:\s*0\.75rem/);
  });

  it("has the panel state an elevation rather than inherit one", () => {
    // The panel used to be pinned to `--tds-elevation-card: none`. That was
    // right while the tint convention carried ALL hierarchy, but a dashboard
    // of a dozen equal-weight cards on a near-white page read as one flat
    // sheet, so the panel now takes the smallest shadow at rest and lifts on
    // hover (app.css). What still matters is that the surface DECIDES —
    // inheriting base's default silently would be the actual regression.
    expect(surfaceCss.panel).toMatch(/--tds-elevation-card:\s*\S+/);
  });

  it("declares the whole panel token family in base.css", () => {
    // surfaces/*.css may only reference --tds-* tokens base.css defines
    // (asserted per-surface above); these are the ones app.css reads, which
    // that check cannot see. A missing one is silent: the var() falls back
    // to nothing and the rail loses its gradient / the canvas its tint.
    for (const token of [
      "--tds-panel-accent",
      "--tds-panel-rail-from",
      "--tds-panel-rail-to",
      "--tds-panel-canvas",
      "--tds-panel-glow",
      "--tds-panel-title-size",
      "--tds-page-card",
      "--tds-page-line",
      "--tds-page-muted",
    ]) {
      expect(base, `${token} missing from base.css`).toContain(`${token}:`);
    }
  });

  it("keeps the per-product accent a token-only override", () => {
    // The admin panel and the customer portal differ on exactly one axis:
    // --tds-panel-accent, selected by the data-frontend attribute the host
    // writes onto <html>. The "only custom properties" test above already
    // rejects a component rule here; this pins the mechanism itself so a
    // future per-target divergence has to be a deliberate edit.
    expect(surfaceCss.panel).toContain(
      '[data-surface="panel"][data-frontend="customer"]',
    );
    expect(surfaceCss.panel).toMatch(/--tds-panel-accent:\s*var\(--color-/);
  });

  it("scopes panel rules on generic primitives to the panel surface", () => {
    // app.css is imported by the BLOG too (for .editorial-grid). An unscoped
    // rule on .tds-card / .tds-widget / .tds-page__title would silently hand
    // the blog the panel's canvas, hover elevation and display sizes.
    for (const selector of [
      ".tds-card:hover",
      ".tds-widget__title",
      ".tds-page__title",
      ".panel-main",
    ]) {
      const idx = app.indexOf(selector);
      expect(idx, `${selector} missing from app.css`).toBeGreaterThan(-1);
      // Walk back to the start of the selector list and require the scope.
      const lineStart = app.lastIndexOf("}", idx);
      const selectorList = app.slice(lineStart + 1, idx);
      expect(
        selectorList,
        `${selector} must be scoped [data-surface="panel"]`,
      ).toContain('[data-surface="panel"]');
    }
  });

  it("makes the three surfaces mutually distinct", () => {
    const bodies = SURFACES.map((s) => surfaceCss[s].replace(/\s+/g, ""));
    expect(new Set(bodies).size).toBe(SURFACES.length);
  });
});

describe("primitives.css tokenisation", () => {
  const tokenised = [
    [".chip", "--tds-radius-chip"],
    [".status-pill", "--tds-radius-badge"],
    [".btn", "--tds-radius-btn"],
    [".field-boxed", "--tds-radius-input"],
    [".tds-card", "--tds-radius-card"],
    [".form-alert", "--tds-radius-alert"],
  ] as const;

  it.each(tokenised)(
    "%s takes its radius from %s rather than a literal",
    (_selector, token) => {
      expect(primitives).toContain(`border-radius: var(${token})`);
    },
  );

  it("never hard-codes 999px, which was the old shared pill literal", () => {
    // 999px is now only legitimate as the *value* of --tds-radius-pill in
    // base.css; a component must reference the token.
    expect(primitives).not.toContain("999px");
  });

  it("still requires .btn for geometry and .btn-* only for colour", () => {
    // The central login shipped `class="btn-primary"` without `.btn` for a
    // while: no padding, no radius, no 44px touch floor.
    const btnBlock = primitives.slice(
      primitives.indexOf(".btn {"),
      primitives.indexOf(".btn-primary {"),
    );
    expect(btnBlock).toContain("border-radius: var(--tds-radius-btn)");
    expect(btnBlock).toContain("padding:");
    const primaryBlock = primitives.slice(
      primitives.indexOf(".btn-primary {"),
      primitives.indexOf(".btn-primary:hover"),
    );
    expect(primaryBlock).not.toContain("border-radius");
  });

  it("authors backdrop-filter unprefixed only", () => {
    // A hand-written pair gets collapsed by lightningcss to the -webkit-
    // form alone, dropping the standard property and breaking Firefox.
    expect(primitives).toContain("backdrop-filter: blur(14px)");
    expect(primitives).not.toContain("-webkit-backdrop-filter");
  });

  it("does not set border-radius on :focus-visible anywhere", () => {
    // A radius on the *element* squashed every rounded control the moment
    // it received focus.
    for (const [name, css] of Object.entries({ base, primitives, app, prose })) {
      const blocks = [...css.matchAll(/:focus-visible[^{]*\{([^}]*)\}/g)];
      for (const block of blocks) {
        expect(block[1], `border-radius under :focus-visible in ${name}`).not.toContain(
          "border-radius",
        );
      }
    }
  });
});

describe("app.css split", () => {
  it("imports primitives.css so existing consumers stay drop-in", () => {
    expect(app).toContain('@import "./primitives.css"');
  });

  it("does not import a surface layer", () => {
    // The blog imports app.css for `.editorial-grid`; importing the panel
    // layer here would silently hand the blog the panel's geometry.
    expect(app).not.toMatch(/@import\s+"\.\/surfaces\//);
  });

  it("keeps panel-only chrome out of primitives.css", () => {
    for (const cls of [".portal-sidebar", ".nav-drawer", ".stat-tile", ".nav-item"]) {
      expect(app, `${cls} belongs in app.css`).toContain(cls);
      expect(primitives, `${cls} must not be in primitives.css`).not.toContain(
        `${cls} {`,
      );
    }
  });

  it("gives .dashboard-grid an actual grid", () => {
    // It carried no `display` at all, so the "grid" was a block stack.
    const block = app.slice(
      app.indexOf(".dashboard-grid {"),
      app.indexOf("}", app.indexOf(".dashboard-grid {")),
    );
    expect(block).toContain("display: grid");
  });
});

describe("chip variant catalog", () => {
  it("matches the .chip--* rules actually defined in primitives.css", () => {
    const defined = new Set(
      [...primitives.matchAll(/\.chip--([a-z-]+)\s*\{/g)].map((m) => m[1]),
    );
    expect([...defined].sort()).toEqual([...CHIP_VARIANTS].sort());
  });

  it("keeps the categorical variants --cat- prefixed", () => {
    // The panel wrote `.chip--violet` etc. for a long time, matching
    // nothing; the prefix is the real contract.
    for (const v of CATEGORICAL_CHIP_VARIANTS) {
      expect(v.startsWith("cat-")).toBe(true);
    }
    for (const v of SEMANTIC_CHIP_VARIANTS) {
      expect(v.startsWith("cat-")).toBe(false);
    }
  });
});

describe("resolveChipVariant", () => {
  it("passes through a canonical variant", () => {
    expect(resolveChipVariant("success")).toBe("chip--success");
    expect(resolveChipVariant("cat-teal")).toBe("chip--cat-teal");
  });

  it("maps the bare colour names an admin actually types", () => {
    expect(resolveChipVariant("violet")).toBe("chip--cat-violet");
    expect(resolveChipVariant("teal")).toBe("chip--cat-teal");
    expect(resolveChipVariant("red")).toBe("chip--danger");
    expect(resolveChipVariant("blue")).toBe("chip--info");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(resolveChipVariant("  Violet ")).toBe("chip--cat-violet");
    expect(resolveChipVariant("SUCCESS")).toBe("chip--success");
  });

  it("falls back to neutral for unknown, empty and nullish input", () => {
    // A ticket status colour comes from the database, so an admin can type
    // anything at all. It must never produce an unstyled pill.
    for (const input of ["", "   ", "chartreuse", "#ff0000", null, undefined]) {
      expect(resolveChipVariant(input)).toBe("chip--neutral");
    }
  });

  it("honours an explicit fallback", () => {
    expect(resolveChipVariant("nonsense", "info")).toBe("chip--info");
  });

  it("only ever returns a class that primitives.css defines", () => {
    const inputs = [
      ...CHIP_VARIANTS,
      "violet",
      "purple",
      "green",
      "chartreuse",
      "",
      null,
      undefined,
    ];
    for (const input of inputs) {
      const cls = resolveChipVariant(input as string | null | undefined);
      expect(primitives, `${cls} is not defined in primitives.css`).toContain(
        `.${cls} {`,
      );
    }
  });
});

describe("isKnownChipColor", () => {
  it("accepts canonical variants and aliases, rejects the rest", () => {
    expect(isKnownChipColor("cat-rose")).toBe(true);
    expect(isKnownChipColor("pink")).toBe(true);
    expect(isKnownChipColor("chartreuse")).toBe(false);
    expect(isKnownChipColor(null)).toBe(false);
  });
});

describe("prose.css", () => {
  it("exposes .tds-prose, replacing the uninstalled `prose` plugin class", () => {
    expect(prose).toContain(".tds-prose {");
  });

  it("falls back gracefully when --tds-flat-tint is absent", () => {
    // Rendered on a non-blog surface (the CMS preview before it sets
    // data-surface), the blockquote must still be legible.
    expect(prose).toMatch(/var\(\s*--tds-flat-tint,/);
  });

  it("uses the fixed dark surface for code blocks so they never invert", () => {
    expect(prose).toContain("background: var(--color-surface-ink)");
  });
});

describe("hamburger toggle bars", () => {
  it("exposes .tds-menu-bar and its three positions", () => {
    for (const sel of [".tds-menu-bar {", ".tds-menu-bar-top {", ".tds-menu-bar-bot {"]) {
      expect(primitives).toContain(sel);
    }
  });

  it("takes the bar radius from a token, not the landingpage's 2px literal", () => {
    const rule = primitives.match(/\.tds-menu-bar \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("border-radius: var(--tds-radius-bar)");
    expect(rule).not.toMatch(/border-radius:\s*2px/);
  });

  it("flattens the bars on the blog surface", () => {
    // The blog's copy omitted border-radius entirely; that is the surface
    // talking, so it must be expressed as a token override.
    expect(surfaceCss.blog).toMatch(/--tds-radius-bar:\s*var\(--tds-radius-none\)/);
  });

  it("keys the open state on aria-expanded, not a per-app toggle class", () => {
    // Each header keeps its own button class (.menu-toggle / .jnl-menu-toggle),
    // so the shared rule must not name either.
    expect(primitives).toContain('[aria-expanded="true"] .tds-menu-bar-top');
    expect(primitives).not.toContain("jnl-menu-toggle");
    expect(primitives).not.toMatch(/\.menu-toggle\[/);
  });

  it("carries the reduced-motion rule the landingpage was missing", () => {
    expect(primitives).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.tds-menu-bar \{/,
    );
  });
});

describe("modal / confirm", () => {
  // The `.tds-modal` block styles a native <dialog> opened with showModal().
  // An earlier revision was a div overlay that re-implemented the focus trap,
  // Escape handling and stacking by hand. These guard the regression.
  const modalRule = primitives.match(/\.tds-modal \{([^}]*)\}/)?.[1] ?? "";

  it("styles .tds-modal and its ::backdrop", () => {
    expect(primitives).toContain(".tds-modal {");
    expect(primitives).toContain(".tds-modal::backdrop {");
  });

  it("does not re-add the hand-rolled overlay's position/z-index", () => {
    // A top-layer <dialog> needs neither, and a z-index here would be a sign
    // someone reverted to the div overlay.
    expect(modalRule).not.toMatch(/z-index/);
    expect(modalRule).not.toMatch(/position:\s*fixed/);
  });

  it("has no data-open toggle — `open` is the platform's own attribute", () => {
    expect(primitives).not.toContain(".tds-modal[data-open");
    expect(primitives).toContain(".tds-modal[open]");
  });

  it("centres itself with auto margins rather than a grid parent", () => {
    expect(modalRule).toMatch(/margin:\s*auto/);
  });

  it("takes the card radius from the surface token, not a literal", () => {
    const panel = primitives.match(/\.tds-modal__panel \{([^}]*)\}/)?.[1] ?? "";
    expect(panel).toContain("border-radius: var(--tds-radius-card)");
  });

  it("respects reduced motion by gating the entry animation", () => {
    expect(primitives).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\.tds-modal\[open\]/,
    );
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATEGORICAL_CHIP_VARIANTS,
  CHIP_VARIANTS,
  SEMANTIC_CHIP_VARIANTS,
  SURFACES,
  TOAST_VARIANTS,
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

/**
 * The declaration body of a rule, located by its selector.
 *
 * Anchored to the START of a line on purpose: `.chip`, `.btn`,
 * `.field-boxed` and `.tds-table td` each open several rules in
 * primitives.css (`button.chip`, `a.chip`, …), and a plain `indexOf` would
 * silently return whichever qualified variant happens to come first — a
 * passing assertion about the wrong rule.
 */
const ruleBlock = (css: string, selector: string): string | undefined => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const at = css.search(new RegExp(`^${escaped}\\s*\\{`, "m"));
  return at === -1 ? undefined : css.slice(at, css.indexOf("}", at));
};

const base = stripComments(read("base.css"));
const primitives = stripComments(read("primitives.css"));
const prose = stripComments(read("prose.css"));
const app = stripComments(read("app.css"));
const surfaceCss = Object.fromEntries(
  SURFACES.map((s) => [s, stripComments(read(`surfaces/${s}.css`))]),
) as Record<(typeof SURFACES)[number], string>;

/**
 * The `[data-surface="x"] {}` block a layer opens with, i.e. what EVERY
 * consumer of that surface gets. Assertions about a surface's character
 * belong here rather than against the whole file: a layer may also carry
 * opt-in variant blocks (`[data-frontend="admin"]`, `[data-flat]`) whose
 * whole point is to differ, and a file-wide `not.toContain` would forbid
 * them. The base block's closing brace is at column 0, and no token value
 * spans a line, so `\n}` is an exact end marker.
 */
const baseBlockOf = (surface: (typeof SURFACES)[number]): string => {
  const css = surfaceCss[surface];
  const at = css.indexOf(`[data-surface="${surface}"] {`);
  if (at === -1) throw new Error(`base block missing from surfaces/${surface}.css`);
  const end = css.indexOf("\n}", at);
  return css.slice(at, end === -1 ? undefined : end);
};

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

/* Deliberately NOT in GEOMETRY_TOKENS above: that list doubles as "every
   token the BLOG must flatten", and the blog is angular-and-flat, not
   borderless — its hairlines are what separate an article list. Outline
   width gets its own checks below. */
const BORDER_TOKEN = "--tds-border-hairline";

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
    for (const token of [...GEOMETRY_TOKENS, BORDER_TOKEN]) {
      expect(
        themeBlock.includes(`${token}:`),
        `${token} must not be declared inside @theme inline`,
      ).toBe(false);
    }
  });

  it("declares the outline-width token, defaulting to a no-op 1px", () => {
    // Every primitive that draws an outline around itself reads this, so a
    // missing declaration is silent and total: `border: var(--undefined)
    // solid …` is an invalid declaration the browser drops, and every card,
    // chip and boxed field on EVERY surface loses its hairline at once.
    expect(base).toMatch(/--tds-border-hairline:\s*1px/);
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

  it("references no token whose name contains a digit", () => {
    // The check above cannot see one. Its pattern is /var\((--tds-[a-z-]+)/ —
    // a character class with NO `0-9` — so `var(--tds-space-3xl)` is captured
    // as `--tds-space-`, base.css is searched for a token that does not exist,
    // and the assertion fails with a message naming a token nobody wrote.
    // Rather than widen that pattern (which would silently change what a
    // decade of surface files are checked against), forbid the shape outright:
    // token names take word suffixes, never numerals.
    // `--tds-radius-2xl` is the standing counter-example — it exists in
    // base.css and is safe only because no surface file references it.
    for (const [surface, code] of Object.entries(surfaceCss)) {
      const digity = [...code.matchAll(/var\(\s*(--tds-[a-z0-9-]*\d[a-z0-9-]*)/g)].map(
        (m) => m[1],
      );
      expect(digity, `surfaces/${surface}.css references a digit-bearing token`).toEqual(
        [],
      );
    }
  });
});

describe("fluid layout", () => {
  const LAYOUT_TOKENS = [
    "--tds-shell-max",
    "--tds-shell-wide",
    "--tds-shell-article",
    "--tds-shell-prose",
    "--tds-measure",
    "--tds-grid-min",
    "--tds-gutter",
  ] as const;

  it("declares every layout token in base.css", () => {
    for (const token of LAYOUT_TOKENS) {
      expect(base, `${token} must be declared in base.css`).toContain(`${token}:`);
    }
  });

  it("keeps the layout tokens OUT of the @theme inline block", () => {
    // Same reason as the geometry scale: @theme inline substitutes each token's
    // literal value into Tailwind's generated utilities, which makes it
    // impossible to override further down the cascade — a [data-surface] or a
    // consuming app's :root would never be seen.
    const start = base.indexOf("@theme inline");
    const themeBlock = base.slice(start, base.indexOf("}", base.indexOf("--font-mono", start)));
    for (const token of LAYOUT_TOKENS) {
      expect(themeBlock, `${token} must not live in @theme inline`).not.toContain(token);
    }
  });

  it("ships a page shell and an intrinsic grid driven by those tokens", () => {
    const shell = primitives.match(/\.tds-shell\s*\{[^}]*\}/)?.[0] ?? "";
    expect(shell).toContain("var(--tds-shell-max)");
    expect(shell).toContain("margin-inline: auto");
    expect(shell).toContain("var(--tds-gutter)");

    const grid = primitives.match(/\.tds-grid-auto\s*\{[^}]*\}/)?.[0] ?? "";
    expect(grid).toContain("auto-fill");
    expect(grid).toContain("var(--tds-grid-min)");
    // The overflow guard. Without it the grid overflows any viewport narrower
    // than --tds-grid-min, and body{overflow-x:hidden} CLIPS that silently.
    expect(grid).toContain("min(100%");
  });

  it("keeps the prose measure in ch and only the font size fluid", () => {
    // .tds-prose renders inside the panel too (HelpCenter, the blog-cms
    // preview), where the viewport says nothing about the available width. A
    // vw-derived max-width would overflow a narrow content pane on a wide
    // screen; a vw-derived font-size cannot.
    const rule = prose.match(/\.tds-prose\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/max-width:\s*var\(\s*--tds-measure/);
    expect(rule).not.toMatch(/max-width:[^;]*vw/);
    expect(rule).toMatch(/font-size:\s*clamp\(/);
    expect(base).toMatch(/--tds-measure:\s*\d+ch/);
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

  it("makes marketing the borderless surface", () => {
    // The public site separates with fill, tone and spacing rather than by
    // drawing a box around everything. Panel and blog must NOT inherit this:
    // their hairline is load-bearing structure — on a dashboard of a dozen
    // equal-weight cards, and in an article list, the edge IS the separation.
    //
    // Checked against the BASE blocks only (the same narrowing the accent test
    // below applies, and for the same reason): the panel additionally carries
    // an opt-in `[data-flat]` variant, and an attribute nothing else sets may
    // drop the outlines for its one consumer. What must never happen is the
    // hairline going to 0 for every panel consumer at once.
    expect(surfaceCss.marketing).toMatch(/--tds-border-hairline:\s*0/);
    for (const surface of ["panel", "blog"] as const) {
      expect(
        baseBlockOf(surface),
        `${surface} must keep its hairline outlines`,
      ).not.toContain("--tds-border-hairline");
    }
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
      '[data-surface="panel"][data-frontend="admin"]',
    );
    expect(surfaceCss.panel).toMatch(/--tds-panel-accent:\s*var\(--color-/);
  });

  it("leaves the BASE accent neutral, with only admin overriding it", () => {
    // Which way round the override goes is load-bearing, not cosmetic.
    // `tds-tools-frontend` renders on the panel surface and writes no
    // `data-frontend`, so it inherits whatever the base block declares —
    // put the management red there and the PUBLIC tools site turns red and
    // starts claiming rights it does not grant. The base stays navy; the
    // marked surface is the one that opts in.
    const baseBlock = surfaceCss.panel.slice(
      surfaceCss.panel.indexOf('[data-surface="panel"] {'),
      surfaceCss.panel.indexOf('[data-surface="panel"][data-theme="dark"]'),
    );
    expect(baseBlock).toMatch(/--tds-panel-accent:\s*var\(--color-primary\)/);
    expect(baseBlock).not.toContain("--color-management");
    expect(surfaceCss.panel).not.toContain('[data-frontend="customer"]');
  });

  it("gives the panel an opt-in FLAT variant that drops edge and elevation", () => {
    // The public tools site renders on this surface and wants no outlines and
    // no depth at all. It cannot get that from the base block (the admin panel
    // and the customer portal render the same layer), and it must not get it by
    // re-declaring shared classes in its own global.css — so the variant lives
    // here, behind an attribute nothing else sets.
    const flat = ruleBlock(
      surfaceCss.panel,
      '[data-surface="panel"][data-flat]',
    );
    expect(flat, "the flat variant block is missing").toBeDefined();
    expect(flat).toMatch(/--tds-border-hairline:\s*0/);
    expect(flat).toMatch(/--tds-elevation-card:\s*none/);
  });

  it("keeps the flat variant off the accent axis and off overlay depth", () => {
    const flat = ruleBlock(
      surfaceCss.panel,
      '[data-surface="panel"][data-flat]',
    )!;
    // Flat is a GEOMETRY variant. Touching the accent here would give the
    // public tools site a second, undocumented way to end up in a colour it
    // never chose — the exact failure the base-accent test above guards.
    expect(flat).not.toContain("--tds-panel-accent");
    // `--tds-elevation-raised` carries the modal panel's and the dropdown's
    // depth. Zeroing it globally to kill the card lift would make every
    // overlay on the site float with nothing separating it from the page;
    // the lift is switched off in app.css, where the overlay is drawn.
    expect(flat).not.toContain("--tds-elevation-raised");
    expect(app).toContain('[data-surface="panel"][data-flat] .tds-card::after');
  });

  it("gives every edge-only primitive a fill counterpart under [data-flat]", () => {
    // THE test for this whole variant. Four primitives separate from their
    // ground only by their outline, and a borderless one is not "flatter" but
    // invisible — a `.field-boxed` inside a `.tds-card` shares the card's exact
    // fill, so it disappears with its label colliding into its value. None of
    // that throws, warns, or fails a build: it just ships.
    for (const selector of [
      ".status-pill",
      ".chip--neutral",
      ".chip:not(.chip-solid):not([class*=\"--\"])",
      ".field-boxed",
      ".btn-ghost",
    ]) {
      // `[,{]` because these share grouped rules — pinning the literal
      // `selector {` would make the test fail on a pure reformat.
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(
        primitives,
        `[data-flat] ${selector} needs a fill to replace its outline`,
      ).toMatch(new RegExp(`\\[data-flat\\]\\s+${escaped}\\s*[,{]`));
    }
    // The invisible-input case gets its fill pinned explicitly: this is the
    // one where the primitive's own fill EQUALS its usual ground.
    expect(ruleBlock(primitives, "[data-flat] .field-boxed")).toMatch(
      /background:\s*color-mix/,
    );

    const flatSection = primitives.slice(primitives.indexOf("[data-flat] "));
    // No `currentColor` inside these mixes. lightningcss cannot resolve one at
    // build time, so the legacy fallback it emits for the pinned Safari floor
    // is a SOLID `background: currentColor` — a pill filled with its own text
    // colour. Only visible in the built css, never in the source.
    expect(flatSection).not.toContain("currentColor");
    // And never a blanket `.chip`: at (0,2,0) it outranks every `.chip--*`
    // variant's own wash and renders all eleven in one grey.
    expect(flatSection).not.toMatch(/\[data-flat\]\s+\.chip\s*[,{]/);
    // `.brand-header` draws a LITERAL 1px border-bottom rather than using the
    // token, so it is the one separator a flat consumer cannot switch off from
    // its own stylesheet without re-declaring a shared class.
    expect(primitives).toContain("[data-flat] .brand-header {");
  });

  it("keeps .field out of the flat variant", () => {
    // `.field`'s underline is a line BETWEEN two things: it never went through
    // --tds-border-hairline, so it is not lost and must not be "fixed". Giving
    // it a fill here would turn the library's one editorial input into a boxed
    // one on the flat surface.
    expect(primitives).not.toMatch(/\[data-flat\]\s+\.field\s*\{/);
  });

  it("keeps the brand logomark a masked token, not an image", () => {
    // The mark is a SHAPE over a colour token, which is what makes dark mode
    // free — the landingpage's raster pair needs `filter: brightness(0)
    // invert(1)` to survive it. The asset URL stays app-local because
    // tds-shared cannot serve a public/-rooted path.
    const logo = ruleBlock(primitives, ".brand-logo")!;
    expect(logo, ".brand-logo must live in primitives.css").toBeDefined();
    expect(logo).toContain("--tds-brand-logo-mask");
    expect(logo).toMatch(/background-color:\s*var\(--color-primary\)/);
    // Unprefixed only: lightningcss collapses a hand-authored pair to the
    // -webkit- form and drops the standard property, which leaves Firefox
    // painting the un-masked box — a solid navy rectangle.
    expect(logo).not.toContain("-webkit-mask");
    expect(primitives).toContain(".brand-logo--inverse");
  });

  it("orders the dark correction BEFORE the admin block it feeds into", () => {
    // `[data-surface][data-theme]` and `[data-surface][data-frontend]` are
    // both two attributes, i.e. identical specificity — source order is the
    // only thing deciding --tds-panel-rail-to for the admin panel. Flip the
    // two and the dark correction silently wins in LIGHT mode too.
    expect(
      surfaceCss.panel.indexOf('[data-surface="panel"][data-theme="dark"] {'),
    ).toBeLessThan(
      surfaceCss.panel.indexOf('[data-surface="panel"][data-frontend="admin"] {'),
    );
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

  it("never lets .nav-item declare the hue it is supposed to inherit", () => {
    // `--nav-hue` is set per SECTION (inline on .nav-group by NavList.astro)
    // and falls back to white on .portal-sidebar. Declaring it on .nav-item
    // silently wins over both — an element's own declaration beats an
    // inherited value no matter how specific the ancestor's selector is, and
    // an inline style on the PARENT never competes. That is not a
    // near-miss: it shipped, and every active nav item resolved to
    // --color-primary, i.e. navy text on the navy rail at 1.11:1, with the
    // per-zone colour-coding reaching nothing at all.
    const block = app.slice(app.indexOf(".nav-item {"), app.indexOf(".nav-item:hover"));
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(/^\s*--nav-hue:/m);
    // It must still derive the on-rail ink, or the active state loses its colour.
    expect(block).toMatch(/--nav-ink:/);
  });

  it("keeps the nav's on-rail ink lifted off the raw categorical hue", () => {
    // The categorical palette is tuned for dark text on a light canvas. Used
    // raw as ink on the dark rail it lands around 2:1. Every place the active
    // nav item paints text or a glyph must read --nav-ink, not --nav-hue.
    for (const decl of [
      "color: var(--nav-ink)",
      "background: var(--nav-ink)",
    ]) {
      expect(app, `${decl} missing — active nav lost its lifted ink`).toContain(decl);
    }
  });

  it("makes the dark rail descend rather than brighten", () => {
    // --tds-panel-accent follows --color-primary, which FLIPS light in dark
    // mode, so the light-mode 55% foot mix brightened the dark rail 4x and
    // squeezed out the contrast headroom.
    expect(surfaceCss.panel).toContain('[data-surface="panel"][data-theme="dark"]');
  });

  it("makes the three surfaces mutually distinct", () => {
    const bodies = SURFACES.map((s) => surfaceCss[s].replace(/\s+/g, ""));
    expect(new Set(bodies).size).toBe(SURFACES.length);
  });
});

/**
 * The panel rail is the one place in the library where text sits on a
 * DARK ground in BOTH themes, so none of the palette's own light/dark
 * pairing protects it. The active nav item shipped at 1.11:1 (light) and
 * 2.13:1 (dark) — effectively invisible — because two independent token
 * choices were never measured together. This resolves the real chain from
 * the stylesheets and measures it.
 */
describe("nav rail contrast", () => {
  type RGB = [number, number, number];

  const hexOf = (h: string): RGB => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const mix = (a: RGB, b: RGB, pa: number): RGB => [
    a[0] * pa + b[0] * (1 - pa),
    a[1] * pa + b[1] * (1 - pa),
    a[2] * pa + b[2] * (1 - pa),
  ];

  const luminance = ([r, g, b]: RGB) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a: RGB, b: RGB) => {
    const la = luminance(a);
    const lb = luminance(b);
    const hi = Math.max(la, lb);
    const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  };

  /** Pull a token's hex out of base.css, from the light or the dark block. */
  const token = (name: string, theme: "light" | "dark"): RGB => {
    const darkAt = base.indexOf('[data-theme="dark"]');
    const scope = theme === "dark" ? base.slice(darkAt) : base.slice(0, darkAt);
    const m = scope.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"));
    const hex = m?.[1];
    if (!hex) throw new Error(`${name} (${theme}) not found in base.css`);
    return hexOf(hex);
  };

  /** The ratios the CSS actually uses, read back rather than reassumed. */
  const pct = (css: string, re: RegExp) => {
    const raw = css.match(re)?.[1];
    if (!raw) throw new Error(`ratio not found: ${re}`);
    return Number(raw) / 100;
  };

  const LIFT = pct(app, /--nav-ink:\s*color-mix\(\s*in srgb,\s*var\(--nav-hue[^)]*\)[^)]*\)\s*(\d+)%/);
  /** The active row's white scrim, which sits between the label and the rail. */
  const SCRIM = Number(
    app.match(/\.nav-item--active\s*\{[\s\S]*?background:\s*rgb\(255 255 255 \/ ([\d.]+)\)/)?.[1] ??
      NaN,
  );
  const WHITE: RGB = [255, 255, 255];

  const HUES = ["violet", "teal", "amber", "rose", "cyan"] as const;

  const panel = surfaceCss.panel;

  /**
   * The mix share a rail stop actually uses, read back out of
   * surfaces/panel.css rather than restated here. `null` means the stop is
   * a flat token (the default rail's head is bare `--color-surface-navy`).
   */
  const railShare = (selector: string, stop: "from" | "to"): number | null => {
    const at = panel.indexOf(`${selector} {`);
    if (at < 0) throw new Error(`${selector} not found in surfaces/panel.css`);
    const block = panel.slice(at, panel.indexOf("}", at));
    const m = block.match(
      new RegExp(`--tds-panel-rail-${stop}:\\s*color-mix\\([\\s\\S]*?(\\d+)%`),
    );
    return m ? Number(m[1]) / 100 : null;
  };

  const PANEL = '[data-surface="panel"]';

  /**
   * The two rails the two products actually render, resolved from the real
   * token chain. Measuring only ONE of them is how this file would go stale
   * the next time a product's accent changes — which is exactly what the
   * admin's move from navy to the management burgundy was.
   */
  const rails = {
    // Customer portal + the public tools site: the base block, i.e. no
    // `data-frontend` override at all. Flat navy head, accent-mixed foot.
    customer: (theme: "light" | "dark") => {
      const share =
        (theme === "dark"
          ? railShare(`${PANEL}[data-theme="dark"]`, "to")
          : railShare(PANEL, "to")) ?? 0;
      return {
        accent: "--color-primary",
        head: token("--color-surface-navy", theme),
        foot: mix(
          token("--color-primary", theme),
          token("--color-surface-ink", theme),
          share,
        ),
      };
    },
    // Management frontend: both stops mixed from --color-management.
    admin: (theme: "light" | "dark") => {
      const sel =
        theme === "dark"
          ? `${PANEL}[data-theme="dark"][data-frontend="admin"]`
          : `${PANEL}[data-frontend="admin"]`;
      const ink = token("--color-surface-ink", theme);
      const acc = token("--color-management", theme);
      return {
        accent: "--color-management",
        head: mix(acc, ink, railShare(sel, "from") ?? 0),
        foot: mix(acc, ink, railShare(sel, "to") ?? 0),
      };
    },
  } as const;

  const CASES: Array<[keyof typeof rails, "light" | "dark"]> = [
    ["customer", "light"],
    ["customer", "dark"],
    ["admin", "light"],
    ["admin", "dark"],
  ];

  it.each(CASES)("keeps the %s rail deepening toward its foot in %s", (product, theme) => {
    // A rail that brightens at the foot both inverts the intended character
    // and eats the headroom every measurement below depends on.
    const { head, foot } = rails[product](theme);
    expect(luminance(foot)).toBeLessThan(luminance(head));
  });

  it.each(CASES)("clears AA for every %s nav zone in %s theme", (product, theme) => {
    const { head, foot, accent } = rails[product](theme);

    // Nav rows run the WHOLE height of the rail, so the worst case is its
    // LIGHTEST stop, not a fixed end. In light theme that is the head
    // (#050f68) and in dark the foot — measuring only one end flattered the
    // light theme by ~0.8:1 (browser-measured 5.06:1 at the head vs 5.88:1
    // at the foot for the Verwaltung zone).
    const worst = luminance(head) > luminance(foot) ? head : foot;

    // Idle rows are plain white on the rail.
    expect(contrast(WHITE, worst)).toBeGreaterThanOrEqual(4.5);

    expect(SCRIM, "active-row scrim not found in app.css").toBeGreaterThan(0);

    // The panel accent is the Verwaltung zone's hue (panelHues.ts maps that
    // group to `var(--tds-panel-accent)`), and it is the LOWEST of the six in
    // practice — 5.06:1 measured in the browser for the navy — so leaving it
    // out would skip the real worst case. It differs per product, which is
    // the whole reason both rails are measured.
    for (const name of [...HUES, accent]) {
      const hue = token(name.startsWith("--") ? name : `--color-cat-${name}`, theme);
      // --nav-ink lifts the hue toward the rail's ink (white in there).
      const ink = mix(hue, WHITE, LIFT);
      // The active row's own scrim sits between the label and the rail.
      const bg = mix(WHITE, worst, SCRIM);
      expect(contrast(ink, bg), `${name} label in ${product}/${theme}`).toBeGreaterThanOrEqual(4.5);
      // Indicator bar + icon glyph are graphics: 3:1.
      expect(contrast(ink, worst), `${name} graphic in ${product}/${theme}`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(["light", "dark"] as const)(
    "keeps every %s admin nav zone visually separable",
    (theme) => {
      // The admin accent moved INTO the red end of the wheel, where
      // --color-cat-rose already lives. With the Tools group still on rose
      // the two closest zones sat at ΔE 12 — half the next-closest pair —
      // so the rail read as two identical reds. panelHues.ts moves Tools to
      // --color-info; this is the guard that the accent and the categorical
      // set stay far enough apart to wayfind by.
      // CIELAB, because contrast() above answers "is this readable", not
      // "are these two the same colour" — the six zones all clear AA against
      // the rail and are still allowed to be one indistinguishable red.
      const lab = ([r, g, b]: RGB): [number, number, number] => {
        const f = (v: number) => {
          const s = v / 255;
          return s > 0.04045 ? ((s + 0.055) / 1.055) ** 2.4 : s / 12.92;
        };
        const [R, G, B] = [f(r), f(g), f(b)];
        const g2 = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
        const x = g2((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
        const y = g2(R * 0.2126 + G * 0.7152 + B * 0.0722);
        const z = g2((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
        return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
      };
      const deltaE = (a: RGB, b: RGB) => {
        const [al, aa, ab] = lab(a);
        const [bl, ba, bb] = lab(b);
        return Math.hypot(al - bl, aa - ba, ab - bb);
      };

      // The six zones the admin rail renders today: four categorical, the
      // accent, and Tools on --color-info (see panelHues.ts in the host).
      const zones: Array<[string, RGB]> = [
        ["Verwaltung", token("--color-management", theme)],
        ["Support", token("--color-cat-cyan", theme)],
        ["Abrechnung", token("--color-cat-amber", theme)],
        ["Content", token("--color-cat-violet", theme)],
        ["Arbeit", token("--color-cat-teal", theme)],
        ["Tools", token("--color-info", theme)],
      ];
      for (const [i, [nameA, a]] of zones.entries()) {
        for (const [nameB, b] of zones.slice(i + 1)) {
          expect(
            deltaE(a, b),
            `${nameA} vs ${nameB} in ${theme}`,
          ).toBeGreaterThan(15);
        }
      }
    },
  );
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

  it("routes self-outlines through --tds-border-hairline", () => {
    // A borderless surface sets the token to 0; a primitive that keeps a
    // literal 1px around itself simply ignores that and stays outlined.
    for (const selector of [
      ".chip",
      ".status-pill",
      ".btn",
      ".field-boxed",
      ".tds-card",
      ".tds-widget",
      ".tds-modal__panel",
      ".tds-dropdown__panel",
    ]) {
      const block = ruleBlock(primitives, selector);
      expect(block, `no rule for ${selector}`).toBeTruthy();
      expect(block, `${selector} outlines itself with a literal width`).toMatch(
        /border:\s*var\(--tds-border-hairline\)/,
      );
    }
  });

  it("leaves SEPARATORS on a literal 1px", () => {
    // The counterpart to the rule above, and the more important half: these
    // draw a line BETWEEN two things. Routing them through the same token
    // would make "borderless" run every table row and list item together,
    // which is a legibility bug rather than a style choice.
    for (const selector of [".tds-list__row", ".tds-table td", ".hairline"]) {
      const block = ruleBlock(primitives, selector);
      expect(block, `no rule for ${selector}`).toBeTruthy();
      expect(block, `${selector} must not be borderless-able`).not.toContain(
        "--tds-border-hairline",
      );
    }
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

/**
 * Motion + focus contracts. Every failure here is silent in the browser: a
 * suppressed outline still looks fine to a mouse user, an animated
 * `box-shadow` still renders, and a hard-coded duration still moves. They
 * only show up as jank, or as a keyboard user who cannot see where they are.
 */
describe("motion and focus contracts", () => {
  const styleFiles = { base, primitives, app, prose } as const;

  it("never suppresses the outline inside a :focus rule", () => {
    // `.field:focus { outline: none }` is (0,2,0) and the library's only
    // focus rule, the global `:focus-visible`, is (0,1,0) — so this beat it
    // and left every text input in the panel with a 1px border-colour change
    // as its entire focus indicator. WCAG 2.4.11 / 1.4.11.
    for (const [name, css] of Object.entries(styleFiles)) {
      for (const block of css.matchAll(/:focus(-visible|-within)?[^{]*\{([^}]*)\}/g)) {
        expect(block[2], `outline suppressed in a :focus rule in ${name}`).not.toMatch(
          /outline:\s*(none|0)\b/,
        );
      }
    }
  });

  it("never transitions box-shadow", () => {
    // Interpolating a blurred shadow re-rasterises the blur every frame, and
    // the panel's hover also translates the element — so the repaint landed
    // on an already-promoted layer. Express the lift as an opacity fade on a
    // pseudo-element carrying the raised shadow instead.
    for (const [name, css] of Object.entries(styleFiles)) {
      for (const decl of css.matchAll(/transition:\s*([^;}]*)[;}]/g)) {
        expect(decl[1], `box-shadow transition in ${name}`).not.toContain("box-shadow");
      }
    }
  });

  it("never transitions the background shorthand", () => {
    // `background` also covers background-image and background-position,
    // neither of which is cheap to interpolate. Name `background-color`.
    for (const [name, css] of Object.entries(styleFiles)) {
      for (const decl of css.matchAll(/transition:\s*([^;}]*)[;}]/g)) {
        expect(decl[1], `background shorthand transitioned in ${name}`).not.toMatch(
          /(^|,)\s*background\s+/,
        );
      }
    }
  });

  it("takes every duration and easing from a token", () => {
    // 8 of the 10 durations in use were magic numbers and the bare `ease`
    // keyword appeared ~18 times, so "the motion scale" described nothing.
    for (const [name, css] of Object.entries(styleFiles)) {
      for (const decl of css.matchAll(/(?:transition|animation):\s*([^;}]*)[;}]/g)) {
        const body = decl[1];
        expect(body, `hard-coded duration in ${name}: ${body}`).not.toMatch(
          /\b\d+(\.\d+)?m?s\b/,
        );
        // `linear` is legitimate (the landingpage's marquee); the default
        // `ease` family is what drifts.
        expect(body, `bare easing keyword in ${name}: ${body}`).not.toMatch(
          /(^|[\s,])ease(-in|-out|-in-out)?(?=[\s,;]|$)/,
        );
      }
    }
  });

  it("resets end states under reduced motion, not just durations", () => {
    // The global clamp only shortens time — a clamped transition still
    // ARRIVES, so every hover-lift still happened and merely snapped there.
    const reduced = base.slice(base.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/scroll-behavior:\s*auto/);
    expect(reduced).toMatch(/transform:\s*none/);
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

describe("mobile navigation panel", () => {
  // Promoted from the landingpage header once the blog and the tools site
  // became consumers. The mechanics live in src/nav; this pins the half a
  // browser shows and a unit test cannot.
  // Anchored to column 0 so it picks the rule, not the indented copy inside
  // the desktop media query.
  const panel = primitives.match(/^\.tds-mobile-menu \{([^}]*)\}/m)?.[1] ?? "";

  it("exposes the panel and its open state", () => {
    expect(primitives).toContain(".tds-mobile-menu {");
    expect(primitives).toContain('.tds-mobile-menu[data-open="true"] {');
  });

  it("takes its radius from the card token so each surface keeps its voice", () => {
    // The blog flattens --tds-radius-card, which is the whole reason the
    // journal's sheet stays angular without a per-app override.
    expect(panel).toContain("border-radius: var(--tds-radius-card)");
    expect(panel).not.toMatch(/border-radius:\s*[\d.]/);
  });

  it("outlines itself through the hairline token", () => {
    expect(panel).toContain("border: var(--tds-border-hairline) solid");
  });

  it("scrolls instead of overflowing the viewport", () => {
    // The one place this goes beyond the reference. The landingpage's own
    // menu is six short rows; the blog's carries nav, an expanded taxonomy
    // group, a language toggle and a CTA. A fixed panel taller than the
    // viewport has no scrollbar and no error — its lower half is simply
    // unreachable, and `body { overflow-x: hidden }` does nothing about it
    // because the overflow is vertical.
    expect(panel).toMatch(/max-height:\s*calc\(100dvh/);
    expect(panel).toContain("overflow-y: auto");
    expect(panel).toContain("overscroll-behavior: contain");
  });

  it("leaves docking position to the app", () => {
    // Three headers float three different ways. Sharing `top`/`inset-inline`
    // would put the panel in the wrong place on two of them.
    expect(panel).not.toMatch(/(^|\s)(top|bottom|inset-inline|left|right):/);
  });

  it("resets the transform under reduced motion rather than only clamping it", () => {
    // Nested rules close with an indented brace, so a top-level `\n}` is the
    // media block's own.
    const blocks = primitives.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) ?? [];
    const block = blocks.find((b) => b.includes(".tds-mobile-menu")) ?? "";
    expect(block, "no reduced-motion block covers .tds-mobile-menu").not.toBe("");
    expect(block).toContain("transform: none");
  });

  it("hides both halves above the desktop breakpoint itself", () => {
    // Not tidiness — a utility cannot do this job. `hidden` on an element
    // wearing `.btn` loses to `.btn { display: inline-flex }`, because
    // unlayered CSS beats `@layer utilities` outright, so an `lg:hidden`
    // hamburger stays visible at every width with nothing to say so.
    const block = primitives.match(/@media \(min-width: 64rem\) \{[\s\S]*?\n\}/g)
      ?.find((b) => b.includes(".tds-menu-toggle")) ?? "";
    expect(block, "no desktop media query hides the mobile nav").not.toBe("");
    expect(block).toContain(".tds-mobile-menu");
    expect(block).toContain("display: none");
  });

  it("keeps the hamburger button free of colour, because it is worn with .btn", () => {
    // lint:primitives (one byte-identical copy in 20 repos) accepts only
    // btn/chip/tds-dropdown__*, so this class can never replace `.btn` — it
    // may only correct the geometry a text button gets wrong.
    const toggle = primitives.match(/\.tds-menu-toggle \{([^}]*)\}/)?.[1] ?? "";
    expect(toggle).toContain("position: relative");
    expect(toggle).not.toMatch(/(background|color|border-radius):/);
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

describe("toast stack", () => {
  // Every assertion here guards a failure that is invisible in review and
  // silent in the browser: a toast buried behind the chat bubble, a stack
  // that swallows clicks in an empty corner, or one sitting on the panel's
  // theme toggle.
  const hostRule = base.match(/\.tds-toast-host \{([^}]*)\}/)?.[1] ?? "";
  const toastRule = base.match(/\.tds-toast \{([^}]*)\}/)?.[1] ?? "";
  /** z-index of the rule that starts exactly at `<selector> {`. */
  const zIndexOf = (css: string, selector: string) => {
    const start = css.indexOf(`${selector} {`);
    if (start === -1) return NaN;
    const rule = css.slice(start, css.indexOf("}", start));
    return Number(rule.match(/z-index:\s*(\d+)/)?.[1] ?? NaN);
  };

  it("matches the .tds-toast--* rules actually defined in base.css", () => {
    const defined = new Set([...base.matchAll(/\.tds-toast--([a-z-]+)\s*\{/g)].map((m) => m[1]));
    expect([...defined].sort()).toEqual([...TOAST_VARIANTS].sort());
  });

  it("stacks above the live-chat launcher and the cookie notice", () => {
    // Both of those are fixed too; losing this order hides the message
    // reporting the very action the user just took.
    expect(zIndexOf(base, ".tds-toast-host")).toBeGreaterThan(zIndexOf(base, ".live-chat-cta"));
    expect(zIndexOf(base, ".live-chat-cta")).toBeGreaterThan(zIndexOf(base, ".cookie-notice"));
  });

  it("anchors bottom-LEFT so it never covers the live-chat launcher", () => {
    expect(hostRule).toMatch(/bottom:/);
    expect(hostRule).toMatch(/left:/);
    expect(hostRule).not.toMatch(/right:/);
  });

  it("offsets itself by the measured bottom lane, not a guessed height", () => {
    // The cookie notice is fixed to the same corner and publishes its own
    // height as `--tds-bottom-lane` (components/CookieNotice). A hard-coded
    // offset was wrong on desktop AND on a phone — the notice is one line on
    // one and four on the other — and the stack landed on top of it.
    expect(hostRule).toMatch(/bottom:\s*calc\([^)]*--tds-bottom-lane/);
    const mobile = base.slice(base.indexOf("@media (max-width: 40rem)"));
    expect(mobile).toMatch(/bottom:\s*calc\([^)]*--tds-bottom-lane/);
  });

  it("is click-through when empty", () => {
    // The host is always in the DOM (the live regions must pre-exist), so
    // without this it would silently eat clicks in that corner forever.
    expect(hostRule).toMatch(/pointer-events:\s*none/);
    expect(toastRule).toMatch(/pointer-events:\s*auto/);
  });

  it("takes the alert radius from the surface token, not a literal", () => {
    expect(toastRule).toContain("border-radius: var(--tds-radius-alert)");
  });

  it("never transitions its shadow", () => {
    expect(toastRule).not.toMatch(/transition:[^;]*box-shadow/);
  });

  it("gates the entry animation on reduced motion", () => {
    expect(base).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.tds-toast \{/);
  });

  it("offsets the stack past the panel rail, scoped to the panel surface", () => {
    // app.css is imported by the blog too, which has no rail — an unscoped
    // offset would push the blog's toasts 15rem off their corner.
    const idx = app.indexOf(".tds-toast-host");
    expect(idx, ".tds-toast-host offset missing from app.css").toBeGreaterThan(-1);
    const selectorList = app.slice(app.lastIndexOf("}", idx) + 1, idx);
    expect(selectorList).toContain('[data-surface="panel"]');
  });
});

describe("mobile contracts", () => {
  // Every failure guarded here is SILENT on a phone. A table that loses its
  // right-hand columns looks like a table with fewer columns; a 22px tap
  // target looks like a chip. Nothing throws, nothing logs, and none of it
  // is visible on the desktop the code was written on.

  /**
   * EVERY `@media (<query>)` block in `css`, concatenated, braces balanced.
   *
   * All of them, not the first: base.css has two `pointer: coarse` blocks —
   * one hiding scrollbars near the top, one holding the touch targets far
   * below — so a first-match helper silently asserted against the wrong one
   * and reported a rule as missing that was right there.
   */
  const mediaBlock = (css: string, query: string) => {
    const out: string[] = [];
    let from = 0;
    for (;;) {
      const start = css.indexOf(`@media (${query})`, from);
      if (start === -1) break;
      let depth = 0;
      for (let i = css.indexOf("{", start); i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}" && --depth === 0) {
          out.push(css.slice(start, i));
          from = i;
          break;
        }
      }
      if (from < start) break;
    }
    return out.join("\n");
  };

  it("lets a wide table scroll rather than clipping it", () => {
    // `body { overflow-x: hidden }` means an overflowing table is CLIPPED,
    // not scrollable — the module page's update button was unreachable on a
    // phone with no scrollbar to hint that anything was missing.
    const narrow = mediaBlock(primitives, "max-width: 40rem");
    expect(narrow, "no max-width:40rem block in primitives.css").not.toBe("");
    const rule = narrow.match(/\.tds-table \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/display:\s*block/);
    expect(rule).toMatch(/overflow-x:\s*auto/);
  });

  it("keeps body's clipping overflow, which is what makes that necessary", () => {
    // If this ever becomes `auto`/`clip`, the rule above is still correct but
    // its comment is not — and a reviewer would rightly wonder why it exists.
    expect(base).toMatch(/body \{[^}]*overflow-x:\s*hidden/);
  });

  it("gives an interactive chip a 44px target but leaves labels compact", () => {
    const coarse = mediaBlock(primitives, "pointer: coarse");
    expect(coarse).toMatch(/button\.chip,\s*\n?\s*a\.chip \{[^}]*min-height:\s*44px/);
    // `.chip` on its own is a status badge — read, not tapped. Growing it
    // would inflate every table row and list item that carries one.
    expect(coarse).not.toMatch(/^\s*\.chip \{/m);
  });

  it("wraps the label/control row instead of squeezing it", () => {
    const rule = primitives.match(/\.tds-toggle-row \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/flex-wrap:\s*wrap/);
  });

  it("breaks a pasted URL inside a thread bubble", () => {
    // `max-width` caps the bubble; only this breaks a single long token.
    const rule = primitives.match(/\.tds-thread__item \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("leaves the modal a gutter without disturbing its centring", () => {
    const rule = primitives.match(/\.tds-modal \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/width:\s*min\(100% - 2rem,/);
    // A `margin-inline` gutter would have overridden this and dropped the
    // dialog to the top of the screen.
    expect(rule).toMatch(/margin:\s*auto/);
  });

  it("sizes viewport-tall floating panels in dvh, not vh", () => {
    // `100vh` on iOS is the viewport with the URL bar retracted, so a panel
    // measured in it is taller than the space it actually has.
    expect(base).not.toMatch(/100vh/);
  });

  /** Body of the rule that starts exactly at `<selector> {` — no regex, so
   *  a selector full of dots and dashes needs no escaping. */
  const ruleBody = (css: string, selector: string) => {
    const start = css.indexOf(`${selector} {`);
    return start === -1 ? "" : css.slice(start, css.indexOf("}", start));
  };

  it("clears the home indicator on every fixed bottom element", () => {
    for (const sel of [".tds-toast-host", ".cookie-notice", ".live-chat-cta"]) {
      expect(ruleBody(base, sel), `${sel} has no safe-area inset`).toMatch(
        /env\(safe-area-inset-bottom/,
      );
    }
  });

  it("keeps every corner-anchored element out of the cookie notice's lane", () => {
    // The notice spans the FULL width on a phone (`inset-inline: 1rem`), so it
    // occupies the chat launcher's bottom-RIGHT corner as much as the toast
    // stack's bottom-left one. The toast stack has read `--tds-bottom-lane`
    // since the lane existed; the launcher never did and sat on top of the
    // notice at every narrow width. Nothing reports that — the launcher is
    // opaque, so it just looks like a notice with a bite taken out of it.
    for (const sel of [".tds-toast-host", ".live-chat-cta"]) {
      expect(ruleBody(base, sel), `${sel} ignores --tds-bottom-lane`).toMatch(
        /bottom:\s*calc\([^)]*--tds-bottom-lane/,
      );
    }
  });

  it("publishes AND clears the right-hand lane in LiveChatCta", () => {
    // The widget publishes the space it occupies in the bottom-right corner so
    // a host's own fixed chrome can stack above it (the landingpage's "book a
    // call" control sits in exactly that corner, two z-index layers below).
    // `removeProperty` is the half that matters: a lane left standing after the
    // widget is hidden pushes that host chrome up the page forever, and there
    // is no symptom pointing back here.
    const src = readFileSync(
      join(__dirname, "..", "components", "LiveChatCta.tsx"),
      "utf8",
    );
    expect(src).toMatch(/setProperty\(\s*\n?\s*"--tds-right-lane"/);
    expect(src).toMatch(/removeProperty\("--tds-right-lane"\)/);
  });

  it("names the bottom lane before env() in the toast offset", () => {
    // Not style policing: design.test.ts matches `calc([^)]*--tds-bottom-lane`,
    // so an `env()` placed first puts a `)` in that span and fails the lane
    // assertion — with an error that points nowhere near the safe-area work.
    for (const rule of base.match(/bottom:\s*calc\([^;]*--tds-bottom-lane[^;]*;/g) ?? []) {
      expect(rule.indexOf("--tds-bottom-lane")).toBeLessThan(
        rule.includes("env(") ? rule.indexOf("env(") : Infinity,
      );
    }
  });

  it("scales the panel page title with the viewport", () => {
    expect(surfaceCss.panel).toMatch(/--tds-panel-title-size:\s*clamp\(/);
  });

  it("stacks the page head instead of squeezing the title", () => {
    // `flex-wrap` was not enough: the toolbar wraps its own buttons before it
    // will move to a new line, so it stayed beside the title and squeezed it
    // narrower than the word "Dashboard", which then ran under the buttons.
    const narrow = mediaBlock(primitives, "max-width: 40rem");
    const rule = narrow.match(/\.tds-page__head \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/flex-direction:\s*column/);
  });

  it("keeps the small-caps treatment on column headings only", () => {
    // Applied to every `th` it also caught `<th scope="row">`, rendering a
    // module name as letterspaced uppercase muted text — six wrapped lines on
    // a phone. A row header labels its row; it is not a column heading.
    const head = primitives.match(/\.tds-table thead th \{([^}]*)\}/)?.[1] ?? "";
    const any = primitives.match(/\.tds-table th \{([^}]*)\}/)?.[1] ?? "";
    expect(head).toMatch(/text-transform:\s*uppercase/);
    expect(any).not.toMatch(/text-transform/);
  });

  it("keeps a scrolled table's caption inside the viewport", () => {
    const narrow = mediaBlock(primitives, "max-width: 40rem");
    const rule = narrow.match(/\.tds-table > caption \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/position:\s*sticky/);
  });

  it("gives the last sub-44px chrome controls a touch target", () => {
    const coarse = mediaBlock(base, "pointer: coarse");
    for (const sel of [".tds-theme-toggle", ".cookie-notice-btn"]) {
      expect(coarse, `${sel} has no coarse-pointer size`).toContain(sel);
    }
    // 24px, not 44: the WCAG 2.5.8 (AA) minimum. These sit inside a <label>,
    // so the effective target is the whole row, and a 44px box would tear
    // open every settings list in the panel.
    expect(coarse).toMatch(/input\[type="checkbox"\][\s\S]{0,80}min-height:\s*1\.5rem/);
  });
});

/**
 * The "Digitale Maßarbeit" decoration layer. Every failure guarded here
 * is invisible in review and silent in the browser: a decoration that
 * swallows clicks looks like a dead button somewhere else on the page, a
 * field that never dims on a phone looks like a design choice, and a
 * conduit animation that ignores reduced motion looks like nothing at
 * all to the person writing the code.
 */
/**
 * The brand hues in their assigned INTERFACE roles, not just in decoration.
 *
 * Cranberry, coral and gold each have a job in the brand direction — small
 * labels, hover states, short rules — and for a while none of them had a call
 * site outside the decoration layer: cranberry had exactly ONE in the whole
 * library. These pin the roles, and — the part that actually matters —
 * measure the contrast they land at. Moving a colour into a TEXT role is
 * precisely where contrast quietly fails, and no screenshot shows it.
 */
describe("brand hues in interface roles", () => {
  type RGB = [number, number, number];
  const hexOf = (h: string): RGB => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const luminance = ([r, g, b]: RGB) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a: RGB, b: RGB) => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  /**
   * A token's literal, resolved through any number of `var()` aliases.
   *
   * Two lookups, and the order matters: the themed blocks first, then the
   * whole file. The brand aliases (`--color-cranberry`, `--color-gold`) are
   * declared ONCE in the plain `:root` scale — which sits *after* the dark
   * block in the file — precisely because a `var()` alias re-resolves per
   * theme on its own. A theme-scoped search alone therefore misses them.
   */
  const token = (name: string, theme: "light" | "dark"): RGB => {
    const darkAt = base.indexOf('[data-theme="dark"]');
    const themed = theme === "dark" ? base.slice(darkAt) : base.slice(0, darkAt);
    const find = (scope: string) =>
      scope.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
    const raw = find(themed) ?? find(base);
    if (!raw) throw new Error(`${name} (${theme}) not found in base.css`);
    if (raw.startsWith("#")) return hexOf(raw);
    const alias = raw.match(/var\((--[a-z-]+)\)/)?.[1];
    if (!alias) throw new Error(`${name} (${theme}) is neither a hex nor an alias: ${raw}`);
    return token(alias, theme);
  };

  it("gives the eyebrow cranberry through a surface-overridable token", () => {
    expect(base).toMatch(/--tds-eyebrow-color:\s*var\(--color-cranberry\)/);
    const rule = base.slice(base.indexOf(".eyebrow {"), base.indexOf("}", base.indexOf(".eyebrow {")));
    expect(rule).toContain("color: var(--tds-eyebrow-color)");
    expect(rule, "the eyebrow fell back to the neutral grey").not.toContain("--color-muted");
  });

  it("gives the chapter mark bordeaux and its rule solid gold", () => {
    const num = primitives.slice(
      primitives.indexOf(".section-num {"),
      primitives.indexOf(".section-num::before"),
    );
    expect(num).toContain("color: var(--color-accent)");
    const rule = primitives.slice(
      primitives.indexOf(".section-num::before {"),
      primitives.indexOf("}", primitives.indexOf(".section-num::before {")),
    );
    expect(rule).toContain("background: var(--color-gold)");
    // Half-opacity gold lands near 1.8:1 — below the 3:1 a graphic needs.
    expect(rule, "the gold rule must stay solid").not.toMatch(/opacity/);
  });

  it("routes every row hover through the coral wash token", () => {
    expect(base).toMatch(/--tds-hover-wash:\s*color-mix\([^;]*--color-accent-pink/);
    for (const sel of [
      ".tds-list__row:focus-within",
      ".tds-table tbody tr:focus-within td",
      ".entry-row:hover",
    ]) {
      const at = primitives.indexOf(`${sel} {`);
      expect(at, `${sel} not found`).toBeGreaterThan(-1);
      const body = primitives.slice(at, primitives.indexOf("}", at));
      expect(body, `${sel} still uses the neutral sand`).toContain("var(--tds-hover-wash)");
    }
  });

  it.each([
    // Resolved from `--tds-eyebrow-color`, not from `--color-cranberry`
    // directly: this has to measure whatever the eyebrow ACTUALLY renders in,
    // or repointing the token at a hue that fails contrast would sail past.
    ["--tds-eyebrow-color", "--color-paper", 4.5, "eyebrow label on paper"],
    ["--color-accent", "--color-paper", 4.5, "chapter mark on paper"],
    ["--color-gold", "--color-paper", 3, "gold rule on paper (graphic)"],
    ["--color-gold", "--color-surface-navy", 3, "gold rule on a dark section"],
  ] as const)("clears contrast: %s on %s", (fg, bg, min, _what) => {
    // `--color-surface-navy` is a FIXED dark surface, so the light-theme value
    // is the one a dark toned section actually paints in both themes.
    expect(contrast(token(fg, "light"), token(bg, "light"))).toBeGreaterThanOrEqual(min);
  });

  it("keeps the eyebrow readable in dark mode too", () => {
    expect(
      contrast(token("--tds-eyebrow-color", "dark"), token("--color-paper", "dark")),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("re-points the eyebrow inside a dark tone, where cranberry would fail", () => {
    // Cranberry is a DEEP red: 2.16:1 on `--color-surface-navy`. The tone
    // classes already remap the page tokens for their children, so the eyebrow
    // colour belongs in that remap — coral is the light-on-dark counterpart.
    const tone = primitives.slice(
      primitives.indexOf(".tds-tone-navy,"),
      primitives.indexOf(".tds-tone-navy {"),
    );
    expect(tone).toMatch(/--tds-eyebrow-color:\s*var\(--color-accent-pink\)/);
    expect(
      contrast(token("--color-accent-pink", "light"), token("--color-surface-navy", "light")),
      "the on-dark eyebrow colour must clear AA on the navy tone",
    ).toBeGreaterThanOrEqual(4.5);
    // And the guard for WHY it is re-pointed: the light-ground colour must not
    // be usable here, or this rule looks like redundant ceremony.
    expect(
      contrast(token("--tds-eyebrow-color", "light"), token("--color-surface-navy", "light")),
    ).toBeLessThan(4.5);
  });
});

describe("decoration layer", () => {
  /** Body of the rule that starts exactly at `<selector> {`. */
  const ruleBody = (css: string, selector: string) => {
    const start = css.indexOf(`${selector} {`);
    return start === -1 ? "" : css.slice(start, css.indexOf("}", start));
  };

  it("declares every decor token in base.css with a dark twin", () => {
    // A missing token is silent: `rgb(var(--tds-decor-navy) / 0.12)` with
    // an undefined triplet is an invalid colour, i.e. no field at all.
    for (const token of [
      "--tds-decor-navy",
      "--tds-decor-bordeaux",
      "--tds-decor-coral",
      "--tds-decor-gold",
      "--tds-decor-field-strength",
      "--tds-decor-line-opacity",
      "--tds-decor-shape-alpha",
    ]) {
      expect(base, `${token} missing from base.css`).toContain(`${token}:`);
      // The light values are the deep brand hues; on the #070a14 dark
      // ground a #050f68 field is literally invisible.
      const dark = base.slice(base.indexOf('[data-theme="dark"]'));
      expect(dark, `${token} has no dark value`).toContain(`${token}:`);
    }
  });

  it("names the brand hues without borrowing a semantic token", () => {
    // Decoration used to have to reach for --color-warning (an
    // operational state) to get the gold. Aliasing keeps the decoration
    // from pinning itself to a token whose job is to change when the
    // status palette is retuned.
    expect(base).toMatch(/--color-gold:\s*var\(--color-warning\)/);
    expect(base).toMatch(/--color-cranberry:\s*var\(--color-cat-rose\)/);
  });

  it("turns the fields down on phones", () => {
    // The fields are placed at the edges of a WIDE viewport; at 375px the
    // same percentages land under the copy.
    const narrow = base.slice(base.indexOf("@media (max-width: 48rem)"));
    expect(narrow, "no phone reduction for the decor fields").toMatch(
      /--tds-decor-field-strength:\s*0?\.\d+/,
    );
  });

  it("never lets decoration take a click", () => {
    for (const sel of [".tds-wash::before", ".tds-decor", ".tds-shape", ".tds-circuit"]) {
      expect(ruleBody(primitives, sel), `${sel} can swallow clicks`).toMatch(
        /pointer-events:\s*none/,
      );
    }
  });

  it("keeps the wash behind content and inside its own section", () => {
    // z-index:-1 without an `isolation: isolate` on the parent escapes to
    // the nearest ancestor stacking context — i.e. the field disappears
    // behind the page background instead of sitting on the section's.
    expect(ruleBody(primitives, ".tds-wash")).toMatch(/isolation:\s*isolate/);
    expect(ruleBody(primitives, ".tds-wash::before")).toMatch(/z-index:\s*-1/);
  });

  it("scales every field alpha through the strength dial", () => {
    // A hard-coded alpha in one of the gradients is how the phone and
    // dark-mode reductions silently stop applying to that layer.
    const wash = primitives.slice(
      primitives.indexOf(".tds-wash::before"),
      primitives.indexOf(".tds-decor {"),
    );
    for (const layer of wash.matchAll(/rgb\(var\(--tds-decor-[a-z]+\)\s*\/([^)]*)\)/g)) {
      expect(layer[1], `un-dialled alpha: ${layer[0]}`).toContain(
        "--tds-decor-field-strength",
      );
    }
  });

  it("builds the brand bar from the shared proportion tokens", () => {
    // 42 : 20 : 12 with a 6px gap, in TWO places — this bar and the
    // panel's page head (app.css). Restating the five background-position
    // values in either would let them drift.
    for (const token of [
      "--tds-brandbar-height",
      "--tds-brandbar-gap",
      "--tds-brandbar-1",
      "--tds-brandbar-2",
      "--tds-brandbar-3",
    ]) {
      expect(base, `${token} missing from base.css`).toContain(`${token}:`);
    }
    const bar = ruleBody(primitives, ".tds-brandbar");
    expect(bar).toContain("var(--tds-brandbar-1)");
    expect(bar).toContain("var(--tds-brandbar-gap)");
    expect(app, "the panel page head re-derives the bar geometry").toContain(
      "var(--tds-brandbar-1)",
    );
  });

  it("keeps the panel's page-head bar on the per-product accent", () => {
    // The bar's first and longest segment must stay `--tds-panel-accent`
    // or the management frontend loses the red that says "this session
    // can administrate" — the one per-product difference in the system.
    const head = app.slice(
      app.indexOf('[data-surface="panel"] .tds-page__head::before'),
      app.indexOf('[data-surface="panel"] .tds-page__eyebrow'),
    );
    expect(head).toMatch(
      /background-image:\s*\n?\s*linear-gradient\(var\(--tds-panel-accent\)/,
    );
  });

  it("gates the conduit build-up on no-preference and never loops it", () => {
    // The end state IS the resting state (a drawn line), so this belongs
    // under `no-preference` rather than in the reduce clamp — and a
    // decoration that repeats is the "dauerhaftes Pulsieren" the brief
    // rules out.
    expect(primitives).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\.tds-circuit--draw/,
    );
    const draw = primitives.slice(
      primitives.indexOf(".tds-circuit--draw"),
      primitives.indexOf("@keyframes tds-circuit-draw"),
    );
    expect(draw).not.toMatch(/infinite|alternate/);
    expect(draw).toContain("forwards");
  });

  it("re-maps the page tokens inside a dark tone", () => {
    // Same mechanism as `.portal-sidebar`: without it a `.field` or a
    // hairline rendered inside the contact block keeps its light-ground
    // colours and disappears.
    const tone = primitives.slice(
      primitives.indexOf(".tds-tone-navy,"),
      primitives.indexOf(".tds-tone-navy {"),
    );
    for (const token of ["--color-ink", "--color-muted", "--color-line", "--color-card"]) {
      expect(tone, `${token} not re-mapped inside the dark tones`).toContain(
        `${token}:`,
      );
    }
  });

  it("drops the marketing surface off the large shadow", () => {
    // A 32px-blur drop shadow on every card is grey haze on a warm paper
    // ground, and when everything is lifted nothing is.
    expect(surfaceCss.marketing).toMatch(
      /--tds-elevation-card:\s*var\(--tds-shadow-sm\)/,
    );
  });
});

describe("profile chrome", () => {
  it("defines the avatar and every categorical fallback tint", () => {
    expect(primitives).toContain(".tds-avatar {");
    for (const variant of CATEGORICAL_CHIP_VARIANTS) {
      expect(
        primitives,
        `.tds-avatar has no tint for ${variant} — Avatar.tsx can emit it`,
      ).toContain(`.tds-avatar[data-avatar-variant="${variant}"]`);
    }
  });

  it("crops the avatar image instead of stretching it", () => {
    // A portrait upload in a circle without object-fit is squashed, which is
    // exactly what a phone camera produces.
    const rule = primitives.match(/\.tds-avatar \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/object-fit:\s*cover/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/border-radius:\s*var\(--tds-radius-pill\)/);
  });

  it("gives every dropdown row a 44px target at ANY pointer type", () => {
    // A menu row is not a badge: the coarse-pointer block would leave a
    // mouse user with a tremor a 32px target on the same control.
    const rule = primitives.match(/\.tds-dropdown__item \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/min-height:\s*44px/);
  });

  it("hides the dropdown panel with display, not opacity", () => {
    // A panel faded to opacity 0 is still focusable — tabbing would walk
    // into a menu the user cannot see.
    const rule = primitives.match(/\.tds-dropdown__panel\[hidden\] \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/display:\s*none/);
  });

  it("pairs the dropdown row's :hover with :focus-within or :focus-visible", () => {
    expect(primitives).toContain(".tds-dropdown__item:focus-visible");
    expect(primitives).toContain(".tds-dropdown__item--danger:focus-visible");
  });

  it("marks a selected row for BOTH aria-current and aria-checked", () => {
    // The company switcher's rows are `menuitemradio`, which carries
    // `aria-checked` — styling only `aria-current` would leave the active
    // company looking exactly like the other one.
    expect(primitives).toContain('.tds-dropdown__item[aria-current="true"]');
    expect(primitives).toContain('.tds-dropdown__item[aria-checked="true"]');
  });

  it("keeps the dropdown caption out of the roving focus order", () => {
    // A section heading inside the menu is not a row: it must not be
    // focusable, or arrow-key roving stops on a label.
    const rule = primitives.match(/\.tds-dropdown__caption \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).not.toBe("");
    expect(rule).not.toMatch(/min-height:\s*44px/);
    expect(rule).toMatch(/color:\s*var\(--color-muted\)/);
  });

  it("keeps the top bar in app.css and out of primitives.css", () => {
    // Panel-only-by-name chrome, same class of thing as .portal-sidebar.
    expect(app).toContain(".panel-topbar {");
    expect(primitives).not.toContain(".panel-topbar {");
  });

  it("makes the top bar sticky and separated by a hairline", () => {
    const rule = app.match(/\.panel-topbar \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/position:\s*sticky/);
    expect(rule).toMatch(/border-bottom:\s*1px solid var\(--color-line\)/);
    // It sits over `.panel-main`'s top-right glow; a solid paper fill would
    // slice the top off it.
    expect(rule).toMatch(/color-mix\(/);
  });

  it("leaves `display` on the top bar to the shell, like .portal-sidebar", () => {
    // The shell writes `hidden lg:flex`. A `display: flex` here has equal
    // specificity to Tailwind's `.hidden` and app.css lands AFTER the
    // utilities, so it wins — and the bar renders a second time under the
    // mobile header. Nothing errors; you just get two bars, which is only
    // visible in a browser at a narrow width.
    const rule = app.match(/\.panel-topbar \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).not.toMatch(/^\s*display:/m);
    // Same rule for the rail, which is where the pattern comes from.
    const rail = app.match(/\.portal-sidebar \{([^}]*)\}/)?.[1] ?? "";
    expect(rail).not.toMatch(/^\s*display:/m);
  });
});

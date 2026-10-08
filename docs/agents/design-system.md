# Design system

## Layers

| File | Scope | Imported by |
|---|---|---|
| `styles/base.css` | Tokens, resets, dark theme, type primitives | every app |
| `styles/primitives.css` | Cross-surface components | every app |
| `styles/prose.css` | `.tds-prose` | blog, blog-cms, panel wiki |
| `styles/surfaces/{marketing,blog,panel}.css` | Geometry and surface tokens only | exactly one per app |
| `styles/app.css` | Panel and dashboard chrome (imports primitives) | panel, blog |

- Each app sets `data-surface="marketing|blog|panel"` on `<html>` and imports the matching layer. **To change a surface,
  set a token in its layer; never re-declare a shared class in an app.** Apps never hand-author a radius.
- **Surface layers declare only custom properties**, scoped to the bare `[data-surface="…"]` (never `:root[…]`), because
  surfaces nest (the blog-CMS preview renders `data-surface="blog"` inside the panel).
- **The geometry scale is a plain `:root` block, not `@theme inline`** (which bakes literal values into utilities and
  can't be overridden by a surface). Colours and fonts stay in `@theme inline`.
- **In `app.css`, scope rules on generic primitives** (`.tds-card`, `.tds-widget`, `.tds-page__title`) to
  `[data-surface="panel"]`; the blog imports this file. Panel-only names stay unscoped.

## Type

Lato display (headings, wordmark), Plus Jakarta Sans body, JetBrains Mono. Each app JS-imports the Fontsource packages in
its `Layout.astro` frontmatter, never via CSS `@import`.

## Colour tokens (light in `base.css`, dark under `:root[data-theme="dark"]`)

1. **Brand:** `--color-primary` / `-accent` / `-accent-pink`, structural neutrals, fixed `--color-surface-*`,
   `--color-card`, and `--color-on-primary` / `-on-accent` for text on solid fills (never `color: white`; both fills
   flip to pastels in dark mode).
2. **Status:** `--color-success` / `-warning` / `-danger` / `-info`, plus `--color-success-ink` / `--color-warning-ink`
   for label text on their own 12 % wash (raw hues fail contrast there). `--color-gold` aliases the warning hue.
3. **Categorical:** `--color-cat-violet` / `-teal` / `-amber` / `-rose` / `-cyan`.

Every new token needs both a light and a dark value. `--color-management` (brand burgundy) is its own token; see the panel
surface. `--color-border` is an accepted alias of `--color-line` (27 call sites); prefer `--color-line`.

### Every brand hue has an interface role

| Hue | Role | Where |
|---|---|---|
| Navy | Headlines, links, primary actions | throughout |
| Bordeaux | Chapter marks, accented headline words | `.section-num`, `.accent-italic`, `.chip-active` |
| Cranberry | Small labels | `.eyebrow` via `--tds-eyebrow-color` |
| Coral | Hover states, decorative fills | `--tds-hover-wash`, `.tds-shape--coral` |
| Gold | Short rules, single nodes | `.section-num::before`, circuit nodes, brand bar |

- A colour in a text role has its contrast **measured** (`design.test.ts` resolves the real token chain): 4.5:1 text,
  3:1 rules. Cranberry is 2.16:1 on navy, so `.tds-tone-navy` / `-ink` repoint the eyebrow to coral.
- Gold and coral stay out of small body text.
- Dose matters: `.chip` stays grey (colour that's everywhere signals nothing).

## Outlines and the flat variant

- **`--tds-border-hairline`** is the width of the border a primitive draws around **itself**. `marketing` sets it to `0`
  (borderless); panel and blog keep `1px`. **Separators** (`.hairline*`, `.rule`, `.tds-list__row`, `.tds-table`,
  `.tds-toggle-row`) keep a literal `1px`, as do `.tds-alert`, the dashed `.tds-empty` and decoration.
  `design.test.ts` pins both halves.
- **`[data-flat]`** is an opt-in variant (`<html data-surface="…" data-flat>`); `tds-tools-frontend` uses it on the blog
  surface.
  - **Two halves in two files:** fill counterparts in `primitives.css` under bare `[data-flat]`; the token half per
    surface. A flat consumer on a new surface needs that surface's pairing.
  - **Hairline 0 alone makes parts invisible.** `.field-boxed`, `.status-pill`, `.chip--neutral` and `.btn-ghost` get
    fill counterparts. Don't mix `currentColor` in the wash (lightningcss emits a solid `currentColor` fallback), and never
    select `.chip` wholesale (it would override the coloured variants).
  - A nested `.tds-card` gets its own counterpart (one level).
  - `--tds-elevation-raised` stays (overlays need depth); the card's hover lift is switched off in `app.css`.
  - It is `data-flat`, not `data-frontend="tools"`: `data-frontend` is the panel's accent axis.

## Hard 2D shadows (public sites only)

`--tds-shadow-hard`, `-sm` and `-press` default to `none` in `base.css`; only `surfaces/marketing.css` and
`surfaces/blog.css` set them (`6px 6px 0 0 var(--tds-shadow-ink)` …). Primitives read them only under
`:is([data-surface="marketing"], [data-surface="blog"])`: boxes take the large offset, controls the small one and press
into it with `translate`. Dark tones re-declare them with black ink (a `var()` in a custom property resolves where
declared). The panel surface draws them too since 0.48. Blurred `--tds-shadow-*` / `--tds-elevation-*` are unchanged.
**Nothing transitions `box-shadow`**; the panel's hover elevation is an `opacity` fade on a pseudo-element.

**Form controls are pressed in, never lifted.** Text fields, selects, checkboxes, radios, search fields and switch
tracks draw their depth inside the box (`--tds-shadow-inset`, own `--tds-inset-ink` on dark grounds); the outer
`--tds-shadow-hard*` offset is for boxes and buttons only. `design.test.ts` fails on an outer shadow on a control rule.

**No navy shadow under a navy fill** (0.49.5): `.btn-primary`, the filled `.cookie-notice-btn` and
`.live-chat-cta__launcher` cast `--color-accent-pink` on every surface and theme; `.btn-accent` keeps a shade of its
own fill. A consumer that derives an ink from a fill (the landingpage's `--lp-fill`) must special-case navy too.

## The panel surface

- **`--tds-panel-accent` is the single knob**: rail gradient, canvas tint, ambient glow and page-head rule are
  `color-mix()`es over it.
- **Per-product accent:** `[data-surface="panel"][data-frontend="admin"]` swaps it to `--color-management` (burgundy).
  The base block stays navy, because `tds-tools-frontend` writes no `data-frontend`; `design.test.ts` fails if the base
  accent stops being `--color-primary`.
- `--color-management`'s dark twin is `#e8536f` (`--color-accent`'s dark value equals `--color-cat-rose`).
- When the accent moves, re-check nav zones (the host's `panelHues.ts`); the rail suite asserts ΔE > 15 between admin zones.
- **Depth:** the hard offset, blurred elevation `none`. The ink is the landingpage's `rgb(5 15 104 / 0.6)` (opaque navy
  fused a navy button with its offset); `.btn-primary` / `.btn-accent` cast a 45 %-into-black shade of their own fill.
  A light themed subtree restates the ink, `[data-surface="panel"] [data-theme]` the offsets.
- **Spacing carries the offset:** `.dashboard-grid` gaps 1.5rem, a `.tds-stack` of `.tds-card`s 1.25rem. At 0.75–1rem
  the 6 px shadow ate the gap and cards read as one slab.
- `--tds-panel-*` and `--tds-page-*` live in `base.css` with inert defaults. `--tds-page-card|line|muted` escape the
  rail's token remap.
- **`--nav-hue` must never be declared on `.nav-item`** (set per section on `.nav-group`, white fallback on
  `.portal-sidebar`).
- **`--nav-ink` paints anything on the rail** (`color-mix(in srgb, var(--nav-hue) 40%, var(--color-ink))`, floor 6.9:1).
- Active-row fills are plain white scrims (lightningcss collapses `color-mix(var(--x) …)` fallbacks to `var(--x)`).
- The dark rail deepens via `[data-surface="panel"][data-theme="dark"]` (18 % share).
- `.portal-sidebar` takes `contain: layout` (not `paint`, not `size`).
- **The dashboard colour classes are shared:** `.chip--*`, `.status-pill*`, `.stat-tile*`, `.section-accent`,
  `.nav-item*`, the hued `.widget-slot` (45 % border / 12 % wash).

## Layout tokens

- `.tds-shell` (+ `--tds-shell-max`, `--tds-gutter`) and `.tds-grid-auto` (+ `--tds-grid-min`).
  **`min(100%, …)` inside the grid's `minmax()` is required** (else narrow viewports overflow, clipped invisibly).
- **A Tailwind width utility can't override `.tds-shell`** (unlayered beats `@layer utilities`); set the token.
- **No token name may contain a digit** (the token scan regex has no `0-9`); `--tds-radius-2xl` is safe only because no
  surface references it.
- No spacing or type scale here on purpose (apps own display sizing).
- **`.tds-prose` scales size (`vw` clamp) but not measure** (`var(--tds-measure, 65ch)`), because it also renders inside
  panel panes.

## Decoration ("Digitale Maßarbeit")

- `.tds-wash` — soft brand fields at a section's outer edges; on a section, never `body`.
- `.tds-decor` — click-through clipping canvas; following siblings get `z-index: 1`.
- `.tds-shape` — constructed geometry. **`--quarter-*` names the rounded corner.**
- `.tds-circuit` — conduit lines in a decorative `<svg aria-hidden="true">`; animated parts need `pathLength="1"` and
  `data-circuit-line` / `data-circuit-node`.
- `.tds-brandbar` — bordeaux · coral · gold accent; punctuation, not wallpaper.
- `.tds-tone-*` — four grounds; dark ones remap page tokens.
- Alphas go through `--tds-decor-*` tokens; decoration never takes a click or focus.
- Small geometry doesn't read as geometry; make it a dot or drop it.

## Brand mark (`.brand-logo`)

A masked shape: the element is the colour (`background-color: var(--color-primary)`), the asset only the mask, so dark
mode is free. The asset URL stays app-local (`--tds-brand-logo-mask`); `--tds-brand-logo-size` and
`--tds-brand-logo-ratio` (default `1.476`, the asset's 713 × 483) size it. A wrong ratio letterboxes the mark. Author
`mask` unprefixed.

## Focus and interaction rules

- **Fields show no focus ring; the well changes colour instead** (0.49.5). `base.css` gives every text-entry
  control, select, textarea, checkbox and radio `outline-color: transparent` (never `none`: forced-colors repaints it)
  plus `inset 3px 3px 0 0 var(--tds-focus-ink, var(--color-accent))` in ONE rule at (0,3,1), so no consumer
  `box-shadow` can strip the indicator while the ring is hidden. The border keeps its resting colour (no frame on focus). Checked boxes take coral; dark tones set
  `--tds-focus-ink` to coral; the underline `.field` thickens its line. A local input with its own focus design must
  draw an equivalent indicator. `design.test.ts` pins the pairing.
- **Never `outline: none` in a `:focus` rule**; it beats the global `:focus-visible`. `design.test.ts` fails on one,
  and on a `border-radius` inside `:focus-visible`.
- **`:hover` on a container needs `:focus-within` beside it.**
- `:focus-visible` in `base.css` sets no `border-radius`.
- `.app-version` renders on the baseline (not superscript).

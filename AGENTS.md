# Agent notes

This is the shared library consumed by **all** TDS frontends: the public sites
(`tds-landingpage-frontend`, `tds-blog-frontend`), the legacy customer portal (`tds-customer-legacy-frontend`), and
the **frontend platform** — the core host (`tds-core-frontend-pkg`) and both
products (`tds-admin-frontend`, `tds-customer-frontend`). The PHP backends do **not**
import this — they duplicate the small bit of validation they need, by design.

> Status: **required by both architectures, not superseded.** The old internal
> admin (`tds-admin`) that used to consume this was archived + deleted; the frontend
> host + products consume it now instead. See the root `MIGRATION-STATUS.md`.

## Rules of thumb

- **`vi.stubGlobal` is not undone by `vi.restoreAllMocks()` — stubs and spies
  are separate mechanisms (learned on the vitest 4 upgrade, 2026-08-25).**
  `vitest.config.ts` therefore sets `unstubGlobals: true`, and a new suite
  should rely on that rather than remembering an `afterEach`. The failure this
  fixes is close to undebuggable: `vi.spyOn` on a function that is *already* a
  mock returns **that same mock** instead of wrapping it, so one leaked stub
  gives every later test in the file a shared call history. `api.test.ts`
  stubbed `fetch` in one `describe` and never unstubbed it — harmless under
  vitest 2, and under vitest 4 two tests in a *different* `describe` counted six
  calls they never made. **Both passed in isolation**, which is the tell: a
  count assertion that only fails in the full file is contamination, not logic.
- **The landingpage copy in `i18n/translations.ts` carries two standing
  constraints (set 2026-08-16).** The site addresses freelancers, small
  businesses and local trades — the audience the Kleinanzeigen speak to — so
  Framework names stay out of `services.items[].tags` (they belong in the
  `tech` section) and "Mittelstand"/"SaaS" stay out entirely. And:
  - **No free or time-boxed initial consultation — now WITHOUT exception.**
    The classified ads offer one; the website deliberately does not. Nothing
    in `hero.cta1`, `consulting.*`, `about.stat*`, `pricing.*` or the
    landingpage's `lib/faq.ts` may promise
    "kostenlos"/"kostenfrei"/"30 Minuten"/"free". The carve-out that used to
    stand here (`pricing.items[0].includes` naming a free 60-minute intro
    call, plus `pricing.ctaSub`) was **removed on 2026-08-22**: it undercut
    the rule at the one place the visitor is thinking about money.
    `pricing.ctaButton` is now "Unverbindlich anfragen" / "Get in touch",
    matching every other call to action.
    The one legitimate "free" left in the bundle is
    `cookieNotice.consentText` ("your choice is free and can be changed at
    any time") — consent voluntariness, not an offer.
  - **No customer references.** Capabilities are described, clients are not
    named — not even anonymised as a "case study". `portfolio.*` exists in the
    bundle but the section is not mounted.
- **`services.items` has FIVE entries and the fifth renders full-width.**
  `Services.astro` spans the last card across both columns on an odd count.
  Adding or removing one silently changes that layout.
- **Don't promote a component or util here until at least two
  consumers actually need it.** Duplication is cheaper than the wrong
  abstraction.
  - **But check whether the duplicates really are identical before you
    promote — the difference is usually the interesting part.** The two
    hamburger-toggle blocks were labelled a verbatim copy (by the copy
    itself) and were not: the landingpage set `border-radius: 2px` and the
    blog omitted it, which is the *surface* speaking and is now
    `--tds-radius-bar`; and only the blog had a `prefers-reduced-motion`
    rule, so promoting the block **fixed an accessibility gap** on the
    landingpage rather than merely deduplicating. Diff them line by line.
  - **A shared rule must not name a per-app class.** `.tds-menu-bar`'s open
    state keys on `[aria-expanded="true"]` on any ancestor, so each header
    keeps its own toggle class (`.menu-toggle` / `.jnl-menu-toggle`) with
    nothing to coordinate. Scope by the shared class so it cannot leak to
    other expandable controls.
  - **A shared *snippet* is fine when a shared *component* would be a
    pass-through.** `.brand-wordmark` is used at a different size and colour
    in every surface (landingpage footer `text-2xl`, blog sidebar
    `text-[1.0625rem]` + inline ink, blog footer on `#fff`), so a shared
    `<BrandWordmark>` would only forward `class` — the CSS class already *is*
    the abstraction. The wordmark component that does exist is deliberately
    **local to tds-core-frontend-pkg**, where the shell renders it three times
    identically. Promote behaviour, not markup wrappers.
- **`themeBootstrapScript` (src/astro) is the one no-flash theme script.**
  It replaced three hand-copied inline scripts. Two hard rules at the call
  site, both silent-failure traps:
  - **Inject with `set:html`, never as a template body.**
    `<script is:inline set:html={themeBootstrapScript} />` is correct;
    `<script is:inline>{themeBootstrapScript}</script>` leaks the literal
    braces into `dist/` (the raw-body trap in the root CLAUDE.md) and the
    script never parses. Verified in `dist/`: the `"tds-theme"` quotes and the
    `&&` must come out unescaped.
  - **Keep `is:inline` and keep it in `<head>`.** Without `is:inline` Astro
    hoists it into a deferred module and the theme lands *after* first paint —
    exactly the flash it exists to prevent. In the frontend host it must also
    stay **before** the pre-paint auth gate, whose spinner paints in theme
    colours.
  - `THEME_STORAGE_KEY` / `THEME_ATTRIBUTE` (src/design) are the contract
    between the bootstrap (reads), `ThemeToggle` (writes) and `base.css`
    (selects). All three used to hardcode the literals independently. Import
    them; don't retype `"tds-theme"`.
- **`applyThemePreference` (src/theme) is the ONLY write path for the theme.**
  `ThemeToggle` and the frontend host's profile page both go through it, and it
  is what raises `tds:theme-change`. Writing `localStorage` + the attribute by
  hand at a call site still *works* — which is the trap: the host's
  `/me/preferences` sync listens to that event, so a hand-rolled write leaves
  the choice per-browser and it silently fails to follow the user to another
  device. Three things follow from that:
  - **`"system"` is the ABSENCE of a stored value, never the string.** The
    bootstrap already falls through to `prefers-color-scheme` when the key is
    missing, so `applyThemePreference("system")` *removes* it. Writing the word
    would make the bootstrap treat it as corrupt and land on the OS theme by
    accident rather than by design.
  - **Pass `{ announce: false }` when applying a value that came FROM the
    server**, or the sync listener echoes it straight back as a save.
  - **`startSystemThemeSync()` is not optional if you offer "System".** The
    bootstrap runs once, so without it the setting means "whatever the OS said
    at page load" and reads as broken the first time someone flips their OS
    theme with the panel open.
- **No runtime side-effects in any JS module.** `sideEffects: ["*.css"]`
  in package.json — only the stylesheets carry side effects (so bundlers
  keep them); keep the JS modules pure so consumers tree-shake correctly.
- **No bundler-specific tricks.** This builds with `tsup` to dual
  ESM+CJS for maximum consumer compatibility (Astro frontends use
  ESM but their build pipelines occasionally fall back to CJS).
- **The design system and i18n strings are the source of truth.** If you
  change a colour, font, shared component style, or copy string, do it
  here and bump the version — never duplicate into a frontend. Brand
  tokens live as the `@theme inline` block in `styles/base.css`. Canonical
  type stack: **Lato** display (headings + wordmark), **Plus Jakarta Sans**
  body, **JetBrains Mono** mono. (Body/mono were unified here from three
  divergent states — the blog and panel already shipped this pair, the
  landingpage was the outlier on Geist and its `--font-mono` resolved to
  nothing at all because Geist Mono was never installed. Any doc claiming
  the display face is Hanken Grotesk is stale.) Each consuming app must
  JS-import the matching Fontsource packages in its `Layout.astro`
  frontmatter — never as a CSS `@import`.
- **Colour tokens come in three families, all in `base.css` (light) +
  `:root[data-theme="dark"]` (dark).** (1) Brand: `--color-primary`/`-accent`/
  `-accent-pink` + the structural neutrals + the fixed `--color-surface-*` /
  `--color-card`. (2) Semantic status (since 0.5.x): `--color-success`/
  `-warning`/`-danger`/`-info`. (3) Categorical wayfinding (since 0.5.x):
  `--color-cat-violet`/`-teal`/`-amber`/`-rose`/`-cyan`. Every new token needs
  **both** a light and a dark value (the dark ground is navy-tinted, so the
  dark value is usually brighter), or it breaks under `data-theme="dark"`.
  The status + categorical tokens used to be duplicated in tds-admin and
  tds-customer-legacy-frontend — they live here now, so don't re-inline them into a frontend.
- **Geometry lives in surface-layer tokens. An app never hand-authors a
  radius.** This *reverses* the previous rule ("the dashboard colour classes
  live in app.css, the geometry stays app-local", with the pill
  `border-radius` deliberately unshared). That convention is exactly what let
  one design drift into three separately-maintained variations, so it is
  gone. The layer stack:

  | File | Scope | Imported by |
  |---|---|---|
  | `styles/base.css` | tokens, resets, dark theme, type primitives | every app |
  | `styles/primitives.css` | cross-surface components | every app |
  | `styles/prose.css` | `.tds-prose` long-form typography | blog + blog-cms |
  | `styles/surfaces/{marketing,blog,panel}.css` | geometry overrides only | exactly one per app |
  | `styles/app.css` | panel/dashboard chrome (imports primitives) | panel + blog |

  Each app sets `data-surface="marketing|blog|panel"` on `<html>` and imports
  the matching surface layer. To change how a surface looks, set a token in
  that layer — do **not** re-declare a shared class in an app's `global.css`.
  Removed by this change: the blog's `.chip{border-radius:0}`, its
  `.display`/`.display-tight`/`.eyebrow` forks and `--flat-tint`/`--flat-hover`;
  the landingpage's duplicate `.display`/`.display-tight`; three separate
  `--font-display` re-declarations.
- **Outline width is a surface token too: `--tds-border-hairline`.** A
  surface sets it to `0` to become borderless — `marketing` does, so the
  landingpage's cards, chips, status pills, boxed fields and buttons draw no
  hairline around themselves; panel and blog keep the default `1px`, where
  the hairline is load-bearing structure. It exists because the primitives
  hard-wired `border: 1px solid var(--color-line)`, so "no outline on this
  surface" previously meant overriding a shared component in the app, which
  is the drift the geometry split exists to prevent.
  **The split that matters is outline vs. separator.** The token governs only
  the border a primitive draws around *itself*. A line drawn *between* two
  things — `.hairline*`, `.rule`, `.tds-list__row`, `.tds-table`,
  `.tds-toggle-row` — keeps its literal `1px`, as do the semantic
  `.form-alert`/`.tds-alert` outline, the dashed `.tds-empty` and the
  decoration shapes. Borderless is a look; running table rows together is a
  legibility bug. `design.test.ts` pins both halves, so routing a separator
  through the token fails the suite.
- **A surface can carry an opt-in FLAT variant: `[data-flat]`.** Two layers
  pair with it — `surfaces/panel.css` and `surfaces/blog.css` — and a consumer
  writes `<html data-surface="…" data-flat>` to get no self-outlines at all,
  while every other consumer of that same layer keeps its hairlines.
  `tds-tools-frontend` (the public tools site) is the consumer, on the **blog**
  pairing since 0.25.1; it rendered the panel pairing until it changed surface,
  which is why both exist and only one is in use. Four things to know before
  touching it:
  - **The variant has TWO HALVES in two files, and only one of them is
    surface-scoped.** The fill counterparts in `primitives.css` are scoped to
    the bare `[data-flat]`, so they already reach every surface; the token half
    (`--tds-border-hairline: 0`) is written per surface. A consumer on a layer
    with no pairing therefore gets every fill and none of the flattening — the
    attribute selects nothing, silently, and the page keeps every outline.
    **Adding a flat consumer on a new surface means adding that surface's
    pairing**, not just the attribute.
  - **`--tds-border-hairline: 0` alone does not flatten a surface, it makes
    parts of it INVISIBLE.** Four primitives separate from their ground *only*
    by their edge, so each one trades that edge for a fill in the "FLAT
    variant" section of `primitives.css`: `.field-boxed` (its `--color-card`
    fill is the same fill as the `.tds-card` it sits in, so a borderless boxed
    input inside a card disappears entirely, label colliding into value),
    `.status-pill` and `.chip--neutral` (transparent — they degrade to bare
    small-caps text), `.btn-ghost` (a button that reads as text until hover).
    Nothing about this failure mode throws, warns or breaks a build —
    `design.test.ts` asserts a fill counterpart exists per selector precisely
    because the browser is otherwise the only witness. **Two traps that only
    the BUILT css shows,** both pinned by that test: the wash must not mix
    `currentColor` (elegant as one hue-following rule would be, lightningcss
    cannot resolve it at build time and the legacy fallback it emits for the
    pinned Safari floor is a solid `background: currentColor`, i.e. a pill
    filled with its own text colour); and it must never select `.chip`
    wholesale, because `[data-flat] .chip` is (0,2,0) against
    `.chip--warning`'s (0,1,0) and would override all eleven coloured variants
    into one grey.
  - **A card INSIDE a card counts too, and it is the one that was found in a
    browser rather than on the list.** `.tds-card` nested in `.tds-card`
    carries its parent's exact `--color-card` fill, so with the outline gone
    the two are one white rectangle. It matters more than it sounds: on the
    tools site the nested card is always the RESULT — the QR preview, the
    contrast sample, the generated password, the generated UTM link — i.e.
    exactly the content the feedback rules say must stay in the flow because
    the visitor has to read or copy it. One level is treated; a third nesting
    is a layout problem, not a colour one.
  - **`--tds-elevation-raised` stays untouched.** It carries the modal panel's
    and the dropdown's depth, and an overlay with no depth is unreadable. The
    card's hover *lift* is switched off in `app.css`, where the overlay that
    draws it lives — the resting shadow is the only thing the token half
    clears.
  - **It is `data-flat`, not `data-frontend="tools"`.** The panel's accent axis
    is keyed on `data-frontend`, and the invariant keeping the public tools site
    out of the management red is "the tools site writes no `data-frontend` at
    all". Spending that attribute on a geometry variant would quietly retire it.
- **The DE|EN switch is `.tds-lang-toggle`** (promoted out of
  `tds-blog-frontend` in 0.25.3). It is a group of **links**, not buttons: each
  half is a real URL to the same page in the other language, so it works without
  JS, opens in a new tab and is crawlable. `aria-current="true"` on the active
  half carries the state — `.on` is only paint, and a consumer that sets one
  without the other is lying to assistive tech. Wrap it in `role="group"` with a
  **bilingual** `aria-label` ("Sprache / Language"): the control names languages
  in their own tongue, so a single-language label is wrong for half its users.
  The active half is `--color-surface-navy`, a FIXED-dark token, because a
  flipping one would put white text on near-white in dark mode. Geometry follows
  `--tds-radius-chip`, so it is square on the blog and a pill on marketing.
  Before this it existed only in the blog, which is why the tools site — the
  blog's sibling public property — shipped a plain text link that showed the
  language you were *not* on and never said which one you were reading.
  **Consumers differ on the hrefs, deliberately:** the blog points at the two
  home pages, the tools site at the equivalent page, because somebody who
  followed a search result to one tool wants that tool.
- **The brand logomark is a masked shape, `.brand-logo`** (promoted out of
  `tds-blog-frontend` in 0.24.2). The element *is* the colour
  (`background-color: var(--color-primary)`) and the asset is only a mask, which
  is what makes dark mode free — the landingpage ships the mark as two raster
  `<img>` and inverts them with `filter: brightness(0) invert(1)`. The asset URL
  stays app-local (`--tds-brand-logo-mask`), because tds-shared cannot serve a
  `public/`-rooted path; `--tds-brand-logo-size` and `--tds-brand-logo-ratio`
  size it. **The ratio matters:** the mask is `contain`-fitted, so a box whose
  aspect does not match the art letterboxes the mark and renders it smaller than
  the space it takes, with nothing to say so. The default `1.476` is the real
  aspect of the shipped asset (713×483). The blog's own copy of this rule
  declares a portrait `0.885` box for that same landscape asset and has been
  drawing the mark undersized ever since — fixing that is a blog change.
  Author `mask` **unprefixed only**, same contract as `backdrop-filter`.
- **The geometry scale is a plain `:root` block, NOT `@theme inline`.**
  `@theme inline` substitutes each token's literal value into Tailwind's
  generated utilities, making it impossible to override further down the
  cascade — a `[data-surface]` layer would never be seen. Colours and fonts
  stay in `@theme inline` (so `text-primary` / `font-display` keep working);
  anything a surface must flip goes in the ordinary `:root` block.
- **Page width and grid density are tokens, and the grid needs no breakpoint.**
  `.tds-shell` (+ `--tds-shell-max` / `--tds-gutter`) and `.tds-grid-auto`
  (+ `--tds-grid-min`) replace the container utility every app was copying per
  call site — tds-blog-frontend had `max-w-5xl mx-auto px-6` in **22** files,
  which is exactly why nothing there ever changed shape above 1024px. Three
  things to know:
  - **`min(100%, …)` inside the grid's `minmax()` is not optional.** A bare
    `minmax(16rem, 1fr)` overflows any viewport narrower than 16rem, and
    `body { overflow-x: hidden }` **clips** that instead of revealing it — no
    scrollbar, no error, the right-hand content simply is not there.
  - **A Tailwind width utility cannot override `.tds-shell`.** This library is
    unlayered and Tailwind emits utilities inside `@layer utilities`; unlayered
    CSS beats every layer. An element with both `tds-shell` and `max-w-5xl`
    takes the shell's width, so a half-migrated page *looks* migrated. Narrow
    one instance by setting the token, never by adding a utility.
  - **No token name may contain a digit.** The "surface references only tokens
    base.css defines" test scans with `/var\((--tds-[a-z-]+)/`, a class with no
    `0-9`, so `var(--tds-space-3xl)` is captured as `--tds-space-` and the
    assertion fails naming a token nobody wrote. A dedicated test now forbids
    the shape. `--tds-radius-2xl` is the standing counter-example and is safe
    only because no surface file references it.
  Deliberately **not** added alongside these: a Utopia-style type/space scale.
  `base.css` carries no spacing or font-size scale on purpose ("the app owns
  display sizing") and every consumer already has Tailwind's; a second
  competing scale across seven repos for one consumer would be a reversal.
- **`.tds-prose` scales its size but not its measure.** `font-size` is a `vw`
  clamp; `max-width` is `var(--tds-measure, 65ch)` and stays in `ch`. That
  split is deliberate: two of the four consumers (`HelpCenter` in
  tds-core-frontend-pkg, the blog-cms markdown preview) render **inside the
  panel**, where the viewport says nothing about the available column width —
  a `vw`-derived measure would overflow a narrow content pane on a wide screen.
- **Decoration is a shared layer, not per-app markup ("Digitale
  Maßarbeit").** Before this existed, every app that wanted a background
  invented one: the landingpage had a three-blob aurora that spring-followed
  the cursor and parallaxed on scroll, the About portrait sat on a blurred
  pink radial, two callouts shared a 135° navy→bordeaux gradient with a glow
  bleeding out of the corner. None of it was shared, all of it was slightly
  different, and it read as generic SaaS. Four primitives replace it — see
  the block at the top of `styles/primitives.css` for the rules they encode:
  - **`.tds-wash`** — soft brand fields at a section's OUTER edges. On a
    section, never on `body`: the fields are positioned relative to the
    element, so on the body they stretch over the whole document and flatten
    into one tint.
  - **`.tds-decor`** — the click-through, clipping canvas the shapes live in.
    Its following siblings get `z-index: 1` automatically, so a call site
    does not have to remember `relative z-10` on its own content.
  - **`.tds-shape`** — constructed geometry (capsule, half, quarter, strongly
    rounded rectangle, diagonal, outline). **The `--quarter-*` suffix names
    the ROUNDED corner**, and getting it wrong is not subtle: a quarter
    anchored to a panel's top-right corner must round its BOTTOM-LEFT, or the
    arc faces off-canvas and what renders is a plain rectangle covering a
    third of the panel. Only visible in a browser.
  - **`.tds-circuit`** — the conduit lines. Wraps a decorative
    `<svg aria-hidden="true">`; animated elements need `pathLength="1"` plus
    `data-circuit-line` / `data-circuit-node`.
  - **`.tds-brandbar`** — the three-part bordeaux · coral · gold accent.
    Deliberately NOT in every section: it is punctuation, and punctuation
    everywhere is wallpaper.
  - **`.tds-tone-*`** — the four grounds. The dark ones re-map the page tokens
    like `.portal-sidebar` does, which is why a `.field` or a hairline inside
    the landingpage's contact block needs no override.

  Two invariants: **alphas go through the `--tds-decor-*` tokens** (they are
  what the phone and dark-mode reductions act on — a hard-coded alpha silently
  opts that layer out), and **decoration never takes a click or a focus**.
- **Small geometry does not read as geometry.** A 6rem quarter-circle behind
  the About portrait was tried and removed: it rendered as a stray grey block,
  because an arc needs enough length to be legible as an arc. If a shape is
  small, make it a dot or drop it.
- **Every brand hue has an INTERFACE role, not only a decorative one.** Three
  of the five were once decoration-only — cranberry had a single call site in
  the whole library while `--color-muted` had 29 — which is how a five-colour
  palette ends up reading as navy, bordeaux and grey. The roles:

  | Hue | Role | Where |
  |---|---|---|
  | Navy | headlines, links, primary actions | throughout |
  | Bordeaux | chapter marks, accented headline words | `.section-num`, `.accent-italic`, `.chip-active` |
  | Cranberry | small labels | `.eyebrow` via `--tds-eyebrow-color` |
  | Coral | hover states, decorative fills | `--tds-hover-wash`, `.tds-shape--coral` |
  | Gold | short rules, single nodes | `.section-num::before`, circuit nodes, the brand bar |

  - **A colour moved into a TEXT role needs its contrast measured, not
    eyeballed.** `design.test.ts` resolves the real token chain (through
    `--tds-eyebrow-color`, not the hue name — otherwise repointing the token
    sails past) and asserts 4.5:1 for text, 3:1 for the rules. Cranberry sits
    at 7.29:1 on paper but only **2.16:1 on the navy tone**, which is why
    `.tds-tone-navy`/`-ink` re-point the eyebrow to coral.
  - **Gold and coral stay out of small body text** — the brand direction is
    explicit, and gold measures 3.45:1, i.e. fine as a rule, short of AA as
    text. The counter-check for that is in the suite.
  - **Dose is part of the design.** `.chip` was deliberately left grey: four to
    five sit on every landingpage service card, so colouring them would put
    twenty coloured labels on one screen. Colour that is everywhere signals
    nothing.
- **Surface layers are scoped to the bare `[data-surface="…"]` attribute,
  never `:root[data-surface="…"]`,** because one surface must nest inside
  another: the blog-CMS markdown preview in the admin panel renders a blog
  surface inside a panel surface
  (`<div class="tds-prose" data-surface="blog">`).
- **Surface-layer files may only declare custom properties** — no component
  rules. The moment a surface layer styles components, the variations start
  diverging again.
- **The dashboard colour classes are shared.** `.chip--*` (status + `cat-*`),
  `.status-pill*`, `.stat-tile*` (tinted KPI tiles, 3px hue top-rule),
  `.section-accent`, `.nav-item*` and the hued `.widget-slot`. Tints follow the
  45% border / 12% wash convention from `base.css`.
- **The panel surface is coloured and softly elevated (0.15.0).** It was dead
  flat, monochrome and reliant on tints alone; a dozen equal-weight cards on a
  near-white page read as one sheet. What changed, all of it token-driven:
  - **`--tds-panel-accent` is the single knob.** The rail gradient, the canvas
    tint, the ambient glow and the page-head rule are all `color-mix()`es over
    it. That is what lets ONE token block re-theme a whole product.
  - **Per-product accent (reversed in 0.20.1).** `[data-surface="panel"]
    [data-frontend="admin"]` swaps the accent to `--color-management`, the
    brand burgundy; the host writes `data-frontend` from `FRONTEND_TARGET`.
    This is the ONLY per-product styling difference — **the management
    frontend reads red, the customer portal reads the brand navy**, everything
    else is identical. (`design.test.ts` pins the mechanism.)
    - The red is a *permissions* signal, not decoration: management.
      tracht-digital.de is where a destructive action lands, and the surface
      itself should say so.
    - **The override is on ADMIN, and the base block stays navy.** That is
      load-bearing, not stylistic: `tds-tools-frontend` renders on this
      surface and writes no `data-frontend`, so it inherits whatever the base
      block declares. Put the management red there and the PUBLIC tools site
      turns red. `design.test.ts` fails the build if the base accent stops
      being `--color-primary`.
    - **`--color-management` is its own token, not `var(--color-accent)`,**
      even though the two share a light value. `--color-accent` flips to
      `#ff8fab` in dark mode, which is byte-identical to `--color-cat-rose` —
      and the accent doubles as the Verwaltung zone's `--nav-hue`, so that
      would put two rail zones on one hex. The dark twin is `#e8536f`.
    - **Moving the accent into the red end of the wheel moved a nav group
      too.** The host's `panelHues.ts` had Tools on `--color-cat-rose`, free
      while the accent was navy; against the burgundy the two closest zones
      sat at ΔE 12 (half the next-closest pair). Tools now reads
      `--color-info`. The `nav rail contrast` suite measures both products'
      rails and asserts every admin zone pair stays above ΔE 15.
  - **Elevation.** `--tds-elevation-card: var(--tds-shadow-sm)` at rest,
    `--tds-elevation-raised` on hover (`@media (hover: hover)`). The panel is
    no longer the flat surface older notes describe; marketing is no longer
    the only surface with a shadow.
  - **`--tds-panel-*` + `--tds-page-*` families live in `base.css`** with inert
    defaults, so a consumer that imports `app.css` without the panel surface
    (the blog, for `.editorial-grid`) is byte-identical to before.
  - **`--tds-page-card|line|muted` are the escape hatch out of the rail's token
    remap.** A custom property's computed value substitutes its `var()`s on the
    element that DECLARES it, so these resolve at `:root` against the page's
    tokens and inherit into `.portal-sidebar` untouched. `.sidebar-expand` used
    to hard-code `#e8e6df`/`#6b6b66`/`#1a2138` plus a second dark rule for
    exactly this reason; both are gone.
  - **`--nav-hue` must NEVER be declared on `.nav-item` (0.15.1).** It is set
    per SECTION — inline on `.nav-group` by the host's `NavList.astro` — and
    falls back to white on `.portal-sidebar`. Declaring it on the item wins
    over both, because an element's own declaration beats an inherited value
    no matter how specific the ancestor's selector is, and an inline style on
    the PARENT never competes. 0.15.0 shipped exactly that: every active nav
    item resolved to `--color-primary`, i.e. navy text on the navy rail at
    **1.11:1**, and the per-zone colour-coding reached nothing at all.
    `design.test.ts` now fails the build on a `--nav-hue` declaration there.
  - **`--nav-ink`, not `--nav-hue`, paints anything on the rail (0.15.1).**
    The categorical palette is tuned for dark text on a LIGHT canvas; the rail
    is dark in both themes, so the raw hue lands near 2:1. `.nav-item` derives
    `--nav-ink: color-mix(in srgb, var(--nav-hue) 40%, var(--color-ink))` —
    on the item, so the mix substitutes the inherited per-section hue — and
    the label, glyph, indicator bar and border all read that. Measured floor
    is now **6.9:1**; a numeric contrast test resolves the real token chain
    and asserts AA, so a ratio tweak that breaks it fails the build.
  - **Active-row fills are plain white scrims, not `color-mix()`es of the
    ink.** lightningcss emits a no-`color-mix` fallback that collapses
    `color-mix(var(--x) …)` to bare `var(--x)`; with the label also reading
    `--nav-ink` that rendered the row's text in its own background colour.
  - **The dark rail deepens via an explicit override.** `--tds-panel-accent`
    follows `--color-primary`, which FLIPS light in dark mode, so the 55%
    foot mix written to darken the rail did the opposite there (luminance
    0.034 → 0.134, a 4x lift) — inverting the intended character and eating
    the contrast headroom. `[data-surface="panel"][data-theme="dark"]` drops
    the share to 18% (and the portal's teal to 16/7%). Both attributes sit on
    `<html>`, so it stays one compound selector, tokens only.
- **Never write `outline: none` in a `:focus` rule.** `.field:focus` and
  `.field-boxed:focus` did, and at (0,2,0) they beat the library's only focus
  rule — the global `:focus-visible` at (0,1,0) — so every text input in the
  panel gave keyboard users a 1px border-colour change as its entire focus
  indicator (WCAG 2.4.11 / 1.4.11). A colour shift is a supplementary cue, not
  an indicator. `design.test.ts` fails the build on one now, and also on a
  `border-radius` inside a `:focus-visible` block (that reshapes the control the
  moment it is focused).
- **`:hover` on a container needs `:focus-within` beside it.** A list row, table
  row, card or widget is not the thing that takes focus — the link or button
  inside it is. Every one of these had pointer feedback and nothing for the
  keyboard.
- **Nothing transitions `box-shadow`.** Interpolating a blurred shadow
  re-rasterises the blur every frame, and the panel's hover ALSO translates the
  element, so the repaint was landing on an already-promoted layer. The hover
  elevation is an `opacity` fade on a pseudo-element carrying the raised shadow.
  Tested.
- **Every duration and easing comes from a token.** 8 of the 10 durations in use
  were magic numbers and the bare `ease` keyword appeared ~18 times. Loops have
  their own scale (`--tds-dur-spin`, `--tds-dur-pulse`, `--tds-ease-spin`) —
  they are periods, not response times, and a spinner tuned to `--tds-dur-base`
  would strobe. `/motion` exports `cssEase` + `durations` for JS-driven
  animation, which cannot read a custom property.
- **Reduced motion needs END STATES reset, not just durations.** The global
  clamp in base.css shortens time with `!important`, but a clamped transition
  still ARRIVES — so every hover-lift still happened and merely snapped, which
  is worse than not lifting. base.css resets the offending transforms, reverts
  `scroll-behavior` (WCAG 2.3.3, which the clamp cannot reach), and flattens the
  spinner to an even ring rather than leaving it frozen mid-rotation.
  `.portal-sidebar` takes `contain: layout` — **not `paint`**, which would clip
  the collapsed rail's tooltips, and not `size`, since the width is what changes.
- **In `app.css`, scope anything that styles a generic primitive.**
  Panel-only-by-name chrome (`.portal-sidebar`, `.nav-item`, `.widget-slot`)
  stays unscoped, but a rule on `.tds-card` / `.tds-widget` / `.tds-page__title`
  must be `[data-surface="panel"] …` — the blog imports this file and would
  otherwise inherit the panel's canvas, hover lift and display sizes. Tested.
- **Categorical chip variants are `--cat-` prefixed, and a dynamic variant
  must go through `resolveChipVariant()`** (from
  `@tracht-digital-solutions/tds-shared/design`). The panel wrote
  `.chip--violet` / `--teal` / `--amber` / `--rose` for a long time; none of
  those exist, so five user badges rendered with no colour coding. Worse, the
  support-ticket board interpolated a colour straight out of the
  `support_tickets_status` table — Tailwind cannot statically extract an
  interpolated class name, and an admin could type a value matching no
  variant. `resolveChipVariant` maps aliases (`violet`→`cat-violet`,
  `red`→`danger`, …) and falls back to `neutral`, so the class is always styled.
- **`--color-border` is an accepted alias of `--color-line`, not a second
  token.** 27 call sites across 8 repos (all four `tds-tool-*` packs,
  ext-website-cms, ext-tools, the panel host) write
  `border-[color:var(--color-border)]`; before the alias they all silently
  fell back to `currentColor`. Prefer `--color-line` in new code; don't
  remove the alias without fixing all 27 sites first.
- **`.btn` carries the geometry, `.btn-*` only the colour — both are
  required.** `class="btn-primary"` alone is a navy rectangle with no
  padding, no radius, no `:disabled` state and no 44px touch floor; that
  shipped on the central login for a while. `.btn-danger` is the destructive
  variant, replacing the bare `.danger` class the panel referenced in five
  places and never defined.
- **`.field` is the input element, not a wrapper.** The landingpage contact
  form's wrapper family is `.contact-field-row` / `-line` / `-label`
  specifically to avoid that collision.
- **A `.tds-table` scrolls itself on a phone — don't wrap it, and don't
  hand-author an `overflow-x` beside it.** Below 40rem the primitive becomes
  `display: block; overflow-x: auto`, the same treatment `.tds-prose table`
  has always had. This matters more than it sounds: `body` is
  `overflow-x: hidden`, so before the rule existed a wide table was *clipped*
  rather than scrollable — the columns on the right simply did not exist on a
  phone, with no scrollbar to suggest otherwise, and the module page's update
  button was among them. **A table whose cells hold no focusable control
  needs `tabindex="0"` + `role="region"` + a label at the call site**,
  otherwise its scrollport is unreachable by keyboard (WCAG 2.1.1).
- **The 44px coarse-pointer floor covers `.btn`, `.field`, `.field-boxed` and
  an INTERACTIVE chip (`button.chip` / `a.chip`) — not `.chip` itself.** The
  distinction is the point: a chip is both this library's status badge and its
  filter/tab control, and only the second is a tap target. Growing the badge
  would bloat every table row that carries one.
- **`.status-pill` is an inline label, not a banner.** For a block message use
  `.form-alert` / `<FormAlert>` (danger) or `.tds-alert` with
  `--tds-alert-hue`. The panel stretched a `.status-pill--info` `<p>` into an
  alert in 11 places.
- **Three feedback primitives, three jobs — and one event is reported ONCE.**
  `.status-pill` inline label · `.tds-alert`/`<FormAlert>` block **in the flow**
  · `ToastHost` **transient overlay**. The rule:
  > Vorübergehendes Ergebnis („Gespeichert.", „Fehler (HTTP 500).") → **Toast**.
  > Dauerzustand (Ladefehler, Validierungs-Zusammenfassung, Leerzustand) →
  > **in-flow alert**. Alles, was gelesen oder kopiert werden muss (temporäres
  > Passwort, ID, Link) → **immer in-flow**, nie ein Toast, der wegblendet.

  Do not do both for the same event — that is duplication, not redundancy.
  Raise a toast with `toast.success("…")` / `.warning` / `.danger` / `.info`
  from `@tracht-digital-solutions/tds-shared/toast` (plain TS, React-free) or
  from `/components` (re-exported, one import for an island). Mount `ToastHost`
  **once** per app in the shell layout; a second one renders nothing and warns.
  The variant vocabulary is `danger`, not `error` — same words as
  `.tds-alert--danger` / `.chip--danger`, and `design.test.ts` pins the list
  against the `.tds-toast--*` rules that actually exist.
  A toast that announces something living **elsewhere** (a new contact request
  that arrived while you were on another page) may carry `href` — the host then
  renders the message as `.tds-toast__link`. **Same-document paths only**: the
  detail travels over a public window event, so `ToastHost` refuses anything
  that is not a leading-slash path (`//host`, `javascript:`, a bare word), the
  same way it re-normalises the variant rather than trusting the sender.
- **Never call the panel API with a relative path — use
  `apiFetch` from `@tracht-digital-solutions/tds-shared/api`.** The products are
  static sites on their own hosts and the composed API is a different origin, so
  `fetch("/contact/messages")` resolves against `management.tracht-digital.de`.
  That does not fail loudly: the static host answers unknown paths with
  `try_files … /index.html`, i.e. **200 + HTML**, so `res.ok` is `true`,
  `res.json()` throws, and the usual `.catch(() => setRows([]))` renders a calm,
  permanent empty state. Every `tds-ext-*` island had its own relative one-liner
  and the contact inbox showed "Keine Anfragen." for months with the rows in the
  database. `apiBase()` reads `<meta name="tds-api-base">` (written by the
  frontend host shell), then `PUBLIC_API_BASE`, then the production gateway;
  `apiUrl()` leaves already-absolute URLs alone, so wrapping a call site is
  idempotent. `apiBase()` **memoises** after its first DOM read — a test that
  swaps the document must call `resetApiBase()`.
  **Fixed bottom chrome shares TWO lanes.** Anything pinned to the bottom of
  the viewport publishes its measured height and anything else pinned there
  adds it to its own `bottom`. Do not hard-code an offset instead: the notice
  is one line wide and four narrow, so a literal is wrong on one of them — it
  shipped on top of the notice on BOTH until a browser test caught it.
  - **`--tds-bottom-lane`** — full-width chrome. Published by `CookieNotice`
    (ResizeObserver), read by `.tds-toast-host` **and `.live-chat-cta`**. The
    launcher was the one that did not read it, and the notice spans the whole
    width on a phone, so the two overlapped at every narrow width.
  - **`--tds-right-lane`** — the bottom-RIGHT corner. Published by
    `LiveChatCta` from its CLOSED launcher, read today by the landingpage's
    `.floating-cta-group`. That control sits in the same corner at `z-index:
    35` against the launcher's 95, i.e. it was covered outright wherever the
    widget is switched on.

  **The publisher must CLEAR its lane** — on unmount, and on any state where it
  stops occupying the space (`LiveChatCta` clears on hide and on open). A lane
  left standing pushes unrelated chrome up the page forever, and nothing about
  that symptom points back at the component that caused it. `design.test.ts`
  asserts both `setProperty` and `removeProperty` are present.
- **Reach for the generic layout primitives before inventing a name.**
  `.tds-stack` (+`--tight`/`--loose`) for a vertical stack, `.tds-row`
  (+`--between`) for a wrapping horizontal row, `.tds-compose` (+`__actions`) for
  a reply box, `.tds-toolbar` for an action row, `.marginalia` for metadata/hint
  text. Extensions had invented ~46 separate names for exactly those five shapes
  (`kb__form`, `contact-detail__body`, `project-card__head`, `chats__filters`,
  `*__actions`, `*__meta`, …), none of which had a rule. ~31 genuinely singular
  internals (`cms-editor__blocks`, `live-chat-settings__matrix`,
  `blog-editor__preview`, …) legitimately stay bespoke and knowingly unstyled.
- **Audit new classes for BOTH shapes.** A BEM-shaped audit (`__`/`--`) misses
  single-word orphans, which is how `.btn-secondary` (7 sites, no such variant —
  it is primary/accent/ghost/danger), `.error` and `.muted` all sat unstyled for
  a long time. Check plain words too.
- **Never `window.confirm()` — use `<ConfirmDialog>`.** It wraps a native
  `<dialog>` opened with `showModal()`, so the browser supplies the focus trap,
  Escape, `inert` background, focus restore and top-layer stacking. Two
  non-obvious rules live inside it and must not be "simplified" away:
  - `.tds-modal` carries **no `z-index` and no `position: fixed`** — a top-layer
    dialog needs neither, and their reappearance means someone reverted to a
    `div` overlay. Guarded by `design.test.ts`.
  - Focus is set **imperatively after** `showModal()`, never via React's
    `autoFocus` prop: React does not render that attribute, so the dialog's own
    focusing steps run later and override it. And `showModal` is
    **feature-detected** with an `open`-attribute fallback, because a `<dialog>`
    without `open` is `display: none` — a missing method would make the gated
    destructive action *unreachable*, not just unstyled.
- **New primitives are `tds-`-prefixed** (matching `.tds-spinner` /
  `.tds-skeleton`), because bare names like `.card` / `.page` / `.widget` are
  far too generic for a library the marketing site also loads. Pre-existing
  repo-spanning names (`.btn`, `.chip`, `.field`, `.status-pill`,
  `.brand-header`) keep their names — renaming them would churn every
  consumer for nothing.
- **`src/__tests__/design.test.ts` guards all of the above.** Every failure
  mode here is silent in the browser: a missing surface token just makes a
  `var()` resolve to nothing, and an unknown chip variant renders an
  uncoloured pill. Nothing throws, so nothing else would catch it.
- **`:focus-visible` (base.css) must not set `border-radius` on the element.**
  It used to force `border-radius: 2px`, which visibly squashed every rounded
  control the moment it was focused (text inputs get `:focus-visible` on plain
  click-focus — the admin API-wiki search field went square). The outline
  follows the element's own radius in all supported browsers; only the
  outline itself is authored here.
- **`.app-version` (primitives.css) renders on the baseline, not superscript.** The
  superscript treatment was reverted on user request; wrap versions in
  `<span class="app-version">v{APP_VERSION}</span>` (a leftover `<sup>` still
  renders baseline because the class neutralises the preflight offset).
- **The block-based blog model (`schemas/blogBlocks`) is the source of truth for
  the block editor + renderer.** A blog post's `body` is either a markdown string
  (`bodyFormat="markdown"`, legacy) or a JSON `BlogDocument` string
  (`bodyFormat="blocks"`). `BlogBlockSchema` is a discriminated union; text fields
  hold **inline markdown**. `BLOG_BLOCKS` drives the tds-admin slash menu (`/`
  palette) — its `integration: "ads"` gate hides/disables AdSense until the ads
  integration is configured, and admin-defined custom blocks (`type: "custom"`,
  referencing a content-api `content_snippet`) are appended at runtime, not listed
  here. The tds-content-api `Validator` hand-mirrors this (like the other schemas);
  keep them in sync. Don't move the catalog into a frontend — both the admin editor
  and the blog renderer consume it.
- **The lightningcss `cssTarget` lives in `src/astro` and nowhere else.**
  `styles/app.css` `.brand-header` authors `backdrop-filter` unprefixed;
  lightningcss only adds `-webkit-` when it sees a Safari build target,
  read from `vite.build.cssTarget`. Frontends import `tdsViteBuild` so the
  Safari floor is defined once — never hand-copy the array back into a
  frontend's `astro.config.mjs` (that's the drift this export removed).
- **A mobile menu is `src/nav` + `.tds-mobile-menu`, never a fifth hand-roll.**
  Before this the workspace held four of them: the landingpage's docked dropdown,
  the blog's full-screen overlay at a different breakpoint, the panel host's
  off-canvas drawer — and the tools site, a public property with **no mobile
  navigation at all**. Two scroll-lock strategies, two focus strategies, and only
  one of the four both trapped focus and returned it. `mountMobileNav` is the
  union of the best of them; the three public headers keep their own markup and
  link sources and share only the behaviour.
  - **The scroll lock is COUNTED, and that is the part worth protecting.**
    `body.style.overflow` written directly means the first overlay to close
    unlocks the page behind the second — a background that scrolls under an open
    modal, which reads as a CSS bug and points nowhere near the cause. Anything
    new that needs the page still calls `lockBodyScroll()`.
  - **`.tds-menu-toggle` may never replace `.btn`.** `lint:primitives` accepts
    exactly `btn` / `chip` / `tds-dropdown__(trigger|item)`, in a copy that is
    byte-identical across 20 repos, so a toggle wearing only the new class is a
    bare control everywhere — and teaching 20 copies a new name is the most
    expensive possible fix. The class carries geometry only; `design.test.ts`
    asserts it declares no colour.
  - **The panel host is a documented non-consumer.** `tds-core-frontend-pkg`
    keeps its off-canvas drawer: ~30 nav entries across 6 colour-coded zones is
    not a dropdown case. Leaving two mechanics in the system was the deliberate
    choice, not an oversight.
  - **`--tds-dur-none` exists for the `visibility` step**, and only for that. A
    literal `0s` in a transition list is indistinguishable — to a reader and to
    `design.test.ts`'s "every duration comes from a token" check — from the magic
    numbers the motion scale was built to remove.

## Layout

```
styles/                       # design-system CSS (shipped as-is, not built)
├── base.css                  # @theme tokens, dark theme, resets,
│                             #   scrollbar, focus, theme-switch, type
└── app.css                   # shared app chrome (chips/buttons/fields…)
src/
├── index.ts                  # barrel — re-exports types
├── types/                    # shared TS interfaces
├── schemas/                  # Zod schemas
│   └── blogBlocks.ts         # block-based blog doc model + BLOG_BLOCKS
│                             #   slash-menu catalog (see note below)
├── i18n/
│   ├── translations.ts       # DE/EN copy (no React). `footer.slogan` is the
│                             #   brand lead claim ("Digitale Lösungen, die
│                             #   wirklich passen." / "Digital solutions that
│                             #   truly fit.") — the Hero renders it as its
│                             #   LEADING line since 2026-08-22, so one edit
│                             #   drives Hero + Footer + the OG card's copy.
│                             #   NOTE: `hero.tagline` was removed in the same
│                             #   change (it repeated `hero.sub` one line
│                             #   below it). Its only consumers were the
│                             #   landingpage Hero + both index pages; the
│                             #   i18n shape test no longer asserts it.
│   ├── index.ts              # re-exports translations
│   └── react.tsx             # React Context provider + hook
├── motion/                   # animation presets
├── toast/                    # the toast BUS (tds:toast window event,
│                             #   showToast + toast.*). React-free on purpose:
│                             #   plain-TS callers (the host's dashboardLayout.ts)
│                             #   import it without pulling in the runtime.
├── nav/                      # mobile navigation MECHANICS (mountMobileNav +
│                             #   the counted lockBodyScroll). React-free, because
│                             #   the three public headers are .astro markup over
│                             #   three different link sources — there is shared
│                             #   behaviour here, no shared markup. Pairs with
│                             #   .tds-mobile-menu / .tds-menu-toggle / .tds-menu-bar*
│                             #   in primitives.css. The panel host is deliberately
│                             #   NOT a consumer — see the note below.
├── api/                      # the panel API TRANSPORT (apiBase/apiUrl/apiFetch).
│                             #   Also React-free. Every tds-ext-* island calls
│                             #   the composed backend through it — see the
│                             #   "relative fetch" gotcha below.
├── theme/                    # the theme RUNTIME (read/apply/observe the
│                             #   preference, incl. "system"). React-free, and
│                             #   separate from design/ because that file is
│                             #   documented as pure functions and these touch
│                             #   localStorage + document. applyThemePreference
│                             #   is the SINGLE write path and announces
│                             #   tds:theme-change — see the note below.
├── markdown/                 # escape-first renderMarkdown → HTML. React-free.
│                             #   The panel's XSS BOUNDARY: its output goes into
│                             #   dangerouslySetInnerHTML in the blog-CMS preview
│                             #   AND the customer wiki's handbooks. Escaping runs
│                             #   BEFORE any md transform, which is what lets the
│                             #   panel skip dompurify. Change it only with its
│                             #   test suite in front of you.
├── components/               # shared React islands (ThemeToggle, Avatar, FormAlert,
│                             #   ConfirmDialog, CookieNotice, LiveChatCta, ToastHost,
│                             #   Spinner, Skeleton, SkeletonText — their CSS lives in
│                             #   base.css, not app.css, so the landingpage (base-only)
│                             #   gets it too. Avatar is the exception: `.tds-avatar`
│                             #   is in primitives.css, because only the panel
│                             #   surfaces show people. PostCover/AbstractCover
│                             #   are the odd ones out: pure inline-style markup,
│                             #   rendered WITHOUT a client: directive — see below)
├── astro/                    # build presets (cssTarget / tdsViteBuild) +
│                             #   themeBootstrapScript (the no-flash <head> script)
├── cache/                    # SERVER-ONLY page cache for the three public SSR
│                             #   sites (pageCache middleware, resolveEvents,
│                             #   createGenerationCache, PageCacheStore). Imports
│                             #   node:fs — its own entry point, NEVER re-exported
│                             #   from index. See the note below.
└── install/                  # host-side setup wizard (React island) — the
                              #   four sites mount it at /install. See below.
```

`src/__tests__/` holds the vitest suite (`npm run test` / `test:run`).

## `src/cache/` — the public sites' page cache

The three public sites (`tracht-digital.de`, `blog.`, `tools.`) render on demand
(Astro SSR) and store each rendered page as a plain file the web server serves
directly. A hit therefore costs exactly what the old static build cost — it *is*
a static file — while a content change costs one page render instead of one full
CI deploy. This module is that mechanism; the sites supply only their own route
knowledge.

**Consume it as `@tracht-digital-solutions/tds-shared/cache`.** It imports
`node:fs`, `node:path` and `node:crypto`, so it has its own entry point and is
**never re-exported from `./index`** — the root entry is pulled into every
browser bundle in the workspace, and one Node builtin there breaks all of them at
once. `dist/index.js` is asserted to contain no `node:` import.

### The four pieces

- **`pageCache(options)`** — returns TWO halves. `.middleware` serves hits and
  stores misses (a plain `(context, next)` function, so this package never
  imports the `astro:middleware` virtual module; the site wraps it with
  `defineMiddleware`). `.control` answers `status`/`rebuild`/`purge` and is
  mounted on a **real route** — see below.
- **`resolveEvents(map, events)`** — the pure translation from *this content
  changed* to *these pages are stale*. Each site brings its own `EventMap`.
- **`createGenerationCache()`** — the memo a rebuild can throw away.
- **`PageCacheStore`** — the on-disk layout, mirroring what the static build
  produced (`preise/index.html`), so the web server needs no special knowledge.

### Six things that are easy to get wrong

- **A cached page must never outlive its build, and everything about the store
  is designed to make it survive one.** `resolveCacheDirs` keeps the store
  outside the deploy tree and re-links it on every boot precisely so a deploy
  cannot destroy it — which is right for the store and wrong for its contents.
  A stored page is HTML, and that HTML names the build's assets by content hash
  (`/_astro/Hero.CXaElEfT.js`); a deploy rotates every one of those names.
  **This took `tracht-digital.de` down on 2026-08-24** (fixed in 0.32.0): every
  `/_astro/*.js` 404ed, no island hydrated, and the hero section *vanished* —
  its headline and slogan are motion elements whose SSR markup carries the
  `initial` state (`opacity: 0`) and are revealed by hydration. Every other
  section is plain Astro HTML and rendered normally, so the page looked complete
  apart from one blank screenful. **Nothing was red anywhere:** `200` with
  `x-tds-cache: HIT`, a healthy server, and all the new assets present under
  their new names — the only broken thing was that the document asking for them
  was older than they were. Apache serves a hit off disk without waking Node, so
  the application could not have noticed. `resolveCacheDirs` now fingerprints
  the asset filenames and empties the store when they change; an absent marker
  counts as a mismatch, because provenance you cannot establish is provenance
  you must not trust.

- **The control plane must NOT live in middleware**, and the obvious reasoning
  says otherwise. Astro excludes any path segment beginning with `_` from
  routing, so `src/pages/_cache/rebuild.ts` really is impossible — but the fix
  is a differently-named route, not middleware: **Astro does not run middleware
  for a path no route matches.** `App.render()` matches first and short-circuits
  into the 404 response, so a middleware-mounted control plane answered every
  rebuild request with the site's own 404 page: HTML, no cache activity, and a
  status code that reads like a typo in the URL. The sites mount `.control` at
  `/tds/cache/{action}`.
- **A POST to it must carry `Content-Type: application/json`.** Astro's
  `security.checkOrigin` treats a cross-site POST with a form-ish content type as
  CSRF and answers *"Cross-site POST form submissions are forbidden"* — a message
  that names neither content types nor the fix.
- **A resolver may be async, and the blog needs that.** An article's category,
  tags and author are properties of the article, not of the event, so working
  out which taxonomy pages a save dates means looking the article up. A throwing
  resolver loses only its own event's paths; failing the whole rebuild over one
  unreachable lookup would be worse.
- **`purge` and `rebuild` are not the same thing**, and only `rebuild`
  (render, then swap atomically) is safe while the content API is unreachable.
  Every content fetch on these sites is deliberately fail-soft, so after a purge
  the replacement render *succeeds* and quietly bakes the fallbacks in — a purge
  during an outage replaces the site with its own placeholder copy, with nothing
  red anywhere.
- **A module-level memo is correct in a build and permanent in a server.** Six
  call sites across the three sites had that shape; unchanged, a rebuild
  faithfully re-renders whatever the process read at boot and reports success.
  `onInvalidate` is not optional — wire it to the site's own caches.
- **Never store a response carrying `Set-Cookie`** (or `Cache-Control: no-store`).
  It is per-visitor by definition, and serving it to the next visitor is the
  worst failure this component can have. Today no public page renders anything
  session-dependent server-side — `AccountMenu` is `client:idle` and reads `/me`
  in the browser — and that is an invariant to keep, not a coincidence.
- **The query string is not part of the key.** No public site reads
  `Astro.url.searchParams` server-side, so a query cannot change the render, but
  anyone can append one: keying on it would let `?1`, `?2`, `?3` … fill the disk
  and turn every visit into a fresh render. A route that ever does read a
  parameter must opt out of caching instead.

### The token

The control plane authenticates with `TDS_CACHE_TOKEN` (constant-time compare,
hashed first so even the length leaks nothing). **With no token configured it
answers `503` rather than running open** — an unauthenticated rebuild endpoint on
a public origin is free render amplification. The token belongs in the host's
Node environment and **never** in `tds-runtime.json`, which is served publicly
from the docroot; same rule as the site key.

## `src/install/` — the host-side setup wizard

**It is a React island, and it used to be PHP. That was a mistake worth naming.**
The wizard shipped as `install/install.php` inside this package, copied into each
site's `public/install/` by a `prebuild` step. It could never run:
`tds-gateway-api/DEPLOY-PLESK.md` configures **every** frontend subdomain with
*"PHP deaktivieren (rein statische Auslieferung)"* and the go-live checklist
repeats *"PHP aus"*. Only `api.tracht-digital.de` executes PHP. On the four sites
`/install/index.php` was served as plain source or a 403 — and the `.htaccess`
that was supposed to deny the secrets file is not read by an nginx-only vhost
either.

**The rule that generalises: on the four site domains nothing executes. Whatever
ships there has to work as a static file.**

Three files, exported as `@tracht-digital-solutions/tds-shared/install`:

| File | Role |
|---|---|
| `profiles.ts` | The four site profiles as typed objects. The ONLY place the sites differ. |
| `checks.ts` | Pure logic + the individual fetches. No DOM, no React — this is the half worth testing. |
| `InstallWizard.tsx` | The island. Presentation. |

Each site mounts it from a thin `src/pages/install.astro` with `noindex`.

### What it can and cannot do

A browser cannot write to the docroot, so **this installs nothing**. It verifies
the connection, generates `tds-runtime.json`, and then confirms the file the
operator placed is really being served. That confirm step is not optional
polish: a missing config is completely silent, because every content fetch on
these sites is fail-soft and simply renders the baked fallbacks.

Three capabilities died with PHP, and **none of them ever worked in production**:
the same-origin `/api` proxy (a proxy needs a server — it attaches a secret the
browser must never see), the site token and secrets file that only the proxy
read, and the synthetic CORS preflight.

What it gained is the thing it was always meant to measure: **the checks now run
on the same path the site itself uses** — same origin, same CORS, same browser.
PHP called from the server, which proved something else entirely.

### A green route must not be able to report red

Every one of these checks is read by someone deciding whether their deployment
is broken, so a **false alarm costs more than a missing check**: the operator's
first move is to "fix" something that was never wrong. Three ways it has already
happened, all of them invisible to the test suite of the day and all now pinned:

- **A payload node is counted as a LIST or as a MAP — the routes use both.**
  `posts` is a list; `blocks` (`section_key` → value, `/content/landing`),
  `docs` (key → language map, `/content/legal`) and `/healthz`'s `services` are
  maps. `countItems` originally counted arrays only, so `null` — "unerwartetes
  Format" — was the answer for three perfectly healthy routes. `/healthz` was
  carved out first (hence `probeHealth` and the `kind` discriminator); the
  content maps were fixed later, after the blog's wizard reported a red
  `/content/landing` next to a green `/content/blog` on a working host.
  `null` still means genuinely uncountable — missing key, scalar, `null` —
  because "unexpected response" and "0 entries" send an operator to different
  places.
- **A route that can only ever be empty must not be a check.**
  `/content/snippets` is a hard-coded `['snippets' => []]` in `BlogCmsModule`
  (curated snippets were a `tds-content-api` feature with no port), so probing
  it reported "Leer" on every healthy host — and a check that is always amber
  teaches its reader to skip the ones where amber means something. It was
  removed from the blog profile; `installer.test.ts` asserts it stays out.
- **`/healthz` had no CORS at all**, which no amount of care in this package
  could fix. It is answered by the gateway itself, not by an upstream, and the
  gateway deliberately adds no CORS — so the wizard's first and most prominent
  check reported "nicht erreichbar" for a healthy API. Fixed in the gateway
  (`tds-gateway-api` 0.5.0, per-route middleware on `/` and `/healthz` only).
  Worth remembering as a shape: when a probe here is red and the site's own
  traffic is fine, suspect the probe's target, not the probe.

### Step 5 — the site key (0.28.0)

The wizard now registers the site with the API: `POST /sites/handshake` with the
key an admin issued under *Einstellungen → Site-Verbindungen*. This is the only
moment the API learns a site exists at all — `tds-runtime.json` is placed by
hand, so nothing else ever reports which `apiBase` a site published, from which
origin, or whether it is still alive.

- **The key must never enter `tds-runtime.json`.** That file is served publicly
  from the docroot. `RUNTIME_KEYS` is deliberately not extended, and
  `installer.test.ts` asserts no generated config contains a key — because
  "shouldn't this live in the config too?" is the obvious future improvement and
  it would publish the credential to the internet. It is a setup-time value
  here, and a CI secret (`TDS_SITE_KEY`) in the build.
- **It goes in the request BODY**, not a header (no custom header, no new
  preflight) and not the query string (a credential in an access log, a referrer
  or browser history outlives its use).
- **`cors: "missing"` is reported as a warning, not a success.** The handshake
  itself can succeed while the site's own calls from that origin cannot — the
  key was accepted, the allow-list is a separate thing.
- **`RegistrySync` (tools only) reuses the same key** and now reads `synced`, the
  field the API actually returns. It read `count`, which is absent, so the number
  came from the `?? tools.length` fallback: right by accident, and it would have
  stayed right while reporting nothing about what the server stored.

### Four things to keep true

- **Never claim a reason for a failed cross-origin fetch.** It rejects with a
  bare `TypeError`; DNS failure, TLS failure, a dead host and a CORS rejection
  are indistinguishable from inside a browser. `Reachability` therefore has one
  `"blocked"` bucket. A `no-cors` probe may *narrow* it — if that resolves while
  the real request fails, something answered, so CORS is likely — but it returns
  an opaque response with no status, so it stays an indication. `installChecks.test.ts`
  pins this, because "helpfully" hard-coding "CORS" into that message is the
  obvious future refactor.
- **The confirm step must not use `runtimeConfig()`.** That memoises for the
  page's lifetime and sets no cache mode. The operator just uploaded the file
  and the browser may still hold the 404 from a minute ago — the check would
  stay red forever and send someone hunting a bug that is not there. Use
  `readPublishedConfig()`: `cache: "no-store"` plus a `?t=` buster, and the same
  content-type check (a SPA fallback answers `200 + HTML`).
- **There is deliberately no login.** The PHP version demanded one because it
  could WRITE — whoever sets `tds-runtime.json` repoints a public site's whole
  API surface. This page writes nothing, so a client-side gate protects nothing,
  while an unauthenticated password form on a public marketing domain relaying
  credentials to the real auth API, with no server-side rate limiter, is a
  phishing surface we would be installing on purpose. Everything the page
  displays is already in the site's own bundle.
- **The wizard can only test the origin it is loaded on.** A page cannot set
  `Origin`. The landingpage has two (`tracht-digital.de` and `www.`), so
  `profile.origins` exists to *tell* the operator which others still need a
  visit — it is not decoration.

### Adding a site

Add a profile to `profiles.ts` and a `src/pages/install.astro` to the repo. Then
**extend that site's `@astrojs/sitemap` `filter` to exclude `/install`** — as a
`public/` directory it was invisible to the sitemap, as a page it is not, and a
noindex operator page listed in `sitemap-index.xml` is exactly the kind of SEO
defect nothing turns red for. On the landingpage it matters twice: `sitemap({ i18n })`
emits `xhtml:link` alternates for every listed page, and a German-only `/install`
would point at a `/en/` twin that 404s — which invalidates the whole set,
German side included.


## `src/api/` — runtime config

`apiBase()` resolves in this order: **`tds-runtime.json`** (written by the
wizard) → `<meta name="tds-api-base">` → `import.meta.env.PUBLIC_API_BASE` →
`DEFAULT_API_BASE`. `apiFetch` awaits `runtimeConfig()` before resolving a URL,
so every existing call site follows a reconfigured host without being edited.

- **A missing or broken file is not an error.** 404, HTML from the SPA fallback,
  malformed JSON, offline, a timeout — all resolve to `null` and the caller keeps
  its build-time value. A site nobody ran the installer on behaves exactly as it
  did before this existed.
- **The meta tag short-circuits the lookup.** Its presence means "a product
  build that already knows its API" (the host shell writes it), so the admin
  panel and customer portal never request a file only the public sites have.
- **The request has a 3s deadline.** Everything downstream waits on this promise;
  a hung request for a static file would otherwise leave the tools access gate
  spinning forever. That is not hypothetical — it is exactly how the `ToolGate`
  suite failed when the timeout was missing.
- **`primeRuntimeConfig(null)` in a test's `beforeEach`** keeps assertions about
  the one request the test is making. Any suite that mocks `fetch` and inspects
  `mock.calls[0]` needs it.

## `src/components/PostCover.tsx` — one article cover, two properties

`AbstractCover` / `PostCover` / `coverVariant` / `hasPhotoCover` (0.29.0). The flat
brand-geometry covers a post gets when nobody uploaded a picture — six drawings of
solid blocks, hairline circles and the accent square. They lived in
`tds-blog-frontend/src/components/Covers.tsx` until the landingpage's Journal row
needed them too; that file is now a re-export of this one, and the landingpage's
`BlogPostCard.astro` renders it directly.

- **The variant is a hash of the SLUG, which is why this cannot be copied.** Two
  implementations would draw two different pictures of the same article on the
  two public properties. That is the whole reason it is here rather than in
  either site.
- **It renders with no `client:` directive.** Every drawing is inline-styled
  markup with no state, so both consumers get it as static HTML and it costs no
  JavaScript. Don't add hooks to it.
- **`--tds-flat-tint` (variant 4) is declared in `styles/surfaces/blog.css`
  ONLY.** A marketing- or panel-surface consumer never defines it, and an
  undefined custom property in `background` paints *nothing* — a blank cover,
  green build, green tests. The literal `color-mix()` fallback in the component
  is what keeps variant 4 visible off the blog surface; `PostCover.test.tsx`
  fails on a bare `var(--tds-flat-tint)`.
- **`hasPhotoCover()` is the one rule for "is there a real picture".** It accepts
  an absolute URL or a site-local image path. Consumers that render the `<img>`
  themselves (the landingpage's Astro card) must ask it rather than writing their
  own regex — a second rule is how the two surfaces drifted apart before.
  Resolving a storage-relative `/uploads/…` path to an absolute one is the
  *caller's* job, at its data layer, before the value gets here.

## `src/components/AccountMenu.tsx` — the session on a PUBLIC site

The blog and the tools site now carry the same identity control the panel has:
avatar, name, dropdown, top right. The session cookie is
`Domain=.tracht-digital.de`, so it was always there — both sites simply showed a
signed-in customer exactly what they show a stranger.

It is the public twin of `tds-core-frontend-pkg`'s `UserMenu`, and every
difference follows from one fact: **a public page is fully usable signed out.**

- **Reads may follow `apiBase`; writes that set a cookie may NOT.** This is the
  rule to carry to the next island that talks to auth-api from a public site.
  `install/proxy.php` deliberately drops `Set-Cookie` ("these sites read, they
  never log in"), so a `DELETE /logout` routed through the same-origin proxy
  answers **200 and ends nothing** — the button reports success, the page
  reloads, and the header comes back signed in. `accountEndpoints()` therefore
  returns two bases and accepts a configured `authBase` **only when it is
  absolute**; the relative `/api/auth` a proxy install publishes is rejected on
  purpose. Pinned by the "goes to the ABSOLUTE auth origin" test.
- **Logout is `DELETE`.** auth-api registers `DELETE /logout`; a POST answers
  405, which is a *resolved* fetch, so a `catch` around it sees nothing. That
  exact bug shipped once in the panel already.
- **Signing out reloads; it does not redirect to the login form.** The panel
  redirects because it has nothing to show a signed-out visitor. Here the
  visitor came to read an article. A reload rather than a local `setMe(null)`
  because `ToolGate` may already have revealed a premium tool's body from the
  old session.
- **A signed-out visitor is a first-class state**, and which one is the caller's
  call: `loggedOut="nothing"` (the blog) or `loggedOut="login"` (the tools site,
  where a session unlocks something). The sign-in link is painted **immediately**,
  before the probe — on a public site the anonymous visitor is the common case,
  and making them wait a round trip would shift the header for nearly everyone.
- **`hasAccountHint()` gates the refresh, not just the placeholder.** Without it
  every anonymous blog reader pays a `POST /refresh` plus a re-probe on every
  page view. The key is `tds_pub_account` — deliberately not `tds_admin`/
  `tds_customer`, so nobody reads it as something the host's pre-paint gate
  consumes.
- **The hint caches the NAME (`tds_pub_account_label`), and that is the whole
  point of it.** Reserving the avatar alone leaves the trigger at ~66px against
  a settled ~154px, and both headers give their nav a `flex-1`, so the entire
  bar slides sideways when the name arrives. Found by measuring the built site
  in a browser; no test sees a layout shift. Both keys are cleared together on
  sign-out and on any probe that comes back unauthenticated.
- **No company switcher.** Acting as a company needs `X-Act-As-Company`, which is
  not in auth-api's `Allow-Headers` — the preflight would fail, i.e. the request
  is never sent and the control merely looks dead.
- **The six labels live in the component**, not in `i18n/translations.ts`. That
  bundle is the landing page's marketing copy with its own content rules, and
  every `/i18n` consumer would ship these strings.

Both public installer profiles need the pair `GET /auth/me` in `proxy_allow`
**and** `loginUrl` in `runtime_keys`; `installer.test.ts` fails on one without
the other, because half of that configuration fails silently.

## `scripts/` — the release spine for every SSR consumer

`scripts/pack-release.mjs` assembles the deployable tree a Node app is checked
out as on the Plesk host (`app.cjs` + `package.json` + `server/` + `client/` +
a prebuilt `node_modules/` + `tmp/`), and `scripts/app.cjs` is the canonical
Passenger startup file. Consumed **by path**, as a `postbuild`:

```jsonc
"postbuild": "node node_modules/@tracht-digital-solutions/tds-shared/scripts/pack-release.mjs"
```

- **No `exports` entry, and none is wanted.** `node <path>` is a filesystem
  lookup; the `exports` map governs specifier resolution only. What the entry
  *does* need is `"scripts"` in `files`, or npm never puts the directory in the
  tarball — pinned by `src/__tests__/releaseScripts.test.ts`, because nothing
  else in this repo so much as references these two files and the symptom lands
  in a consumer's CI as a MODULE_NOT_FOUND naming a path inside `node_modules`.
- **`root` is `process.cwd()`**, i.e. the consumer's. npm sets the cwd of every
  lifecycle script to the package root. Deriving it from `import.meta.url` (what
  the per-site copies did) would resolve into `node_modules/` once published and
  read *this* package's `package.json`.
- **The startup file is looked up in the consumer first.** The three public
  sites keep their own byte-identical `app.cjs`; the two panel products have
  none, for the same reason they have no `src/`.
- **It arrived here because the instruction in its own header did not scale.**
  It said "fix it once, copy it three times; do not fork it" — and the panel
  products would have made it five. The three sites still carry their copies;
  both paths behave identically, so they can drop them whenever it suits rather
  than as part of a release.
- **`verify()` runs on every build, not only in CI**, and it is the authority on
  what a consumer's `vite.ssr.noExternal` and `tds.release.runtimeDependencies`
  must contain: it fails the build naming any first-party import that survived
  into `server/`, and any bare specifier that does not resolve in the packed
  tree.

## Publishing

Two GitHub Actions workflows (the old tag-triggered `publish.yml` is gone):

- **Dev prerelease (`push → GitHub Packages @dev`)** — every push to `main`
  publishes a prerelease (`<version>-dev.<run>`) under the `@dev` dist-tag, so
  consumers can opt into in-flight changes without a real release.
- **Release (manual → GitHub Packages @latest)** — the `workflow_dispatch`
  button: it bumps the version + tags, builds, and publishes the real version
  to `@latest`. Because the workflow does the bump itself, you don't run
  `npm version` for a release — just land your changes on `main` (commit a
  CHANGELOG entry) and press the button. (Note: the bump means the published
  version may be one patch above the version in your last commit.)

Consumers pin a caret range (e.g. `^0.5.0`), so any matching `@latest` patch
resolves on their next install/build.

## Tests — LiveChatCta

`src/components/LiveChatCta.tsx` is the visitor-facing support bubble, mounted
on the **public** landing page, the blog, the portal and the tools site. It had
no tests; `src/__tests__/LiveChatCta.test.tsx` adds 56.

The first assertions are the negative ones, because the failure mode is a chat
bubble appearing on tracht-digital.de that nobody switched on:

- **nothing renders** while the config is in flight, when the backend says
  `enabled: false`, when the config request fails, when the backend is
  unreachable, or when every tab is switched off;
- the **hide flag is per frontend** (`tds-live-chat-hidden:<frontend>`), so
  dismissing it on the blog does not silence it on the landing page — and a
  blocked `localStorage` (Safari private mode) must not crash the widget;
- the panel **lands on the first ENABLED tab**, not blindly on chat, which
  would otherwise show an empty body when chat is off.

In the chat pane: the session token travels as the **`X-Chat-Token` header,
never in the URL** (a URL lands in server logs), the session is stored per
frontend, the poll cursor advances so a poll never re-fetches what it already
has, the interval is cleared on unmount, and Enter sends while **Shift+Enter**
inserts a newline.

In the contact pane: the **honeypot** is the only bot defence available in the
browser, so it is asserted to be present in the payload AND unreachable to a
person (`tabIndex={-1}`, `aria-hidden`, positioned off-screen). A **429 says
"too many requests"** rather than the validation message — otherwise the
visitor is sent round in circles correcting a form that was fine.

Admin-authored FAQ/doc text renders through `Prose`, which relies on React's
escaping — asserted with an `<img onerror>` that must survive as inert text.

Verified by mutation: 43 deliberate breakages introduced, 43 caught.

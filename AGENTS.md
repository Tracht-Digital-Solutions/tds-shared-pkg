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
- **The geometry scale is a plain `:root` block, NOT `@theme inline`.**
  `@theme inline` substitutes each token's literal value into Tailwind's
  generated utilities, making it impossible to override further down the
  cascade — a `[data-surface]` layer would never be seen. Colours and fonts
  stay in `@theme inline` (so `text-primary` / `font-display` keep working);
  anything a surface must flip goes in the ordinary `:root` block.
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
  - **Per-product accent.** `[data-surface="panel"][data-frontend="customer"]`
    swaps the accent to `--color-cat-teal`; the host writes `data-frontend`
    from `FRONTEND_TARGET`. This is the ONLY per-product styling difference —
    admin reads navy, the portal reads teal, everything else is identical.
    (`design.test.ts` pins the mechanism.)
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
│                             #   truly fit.") — Hero renders it as its accent
│                             #   title, so one edit drives Hero + Footer.
│   ├── index.ts              # re-exports translations
│   └── react.tsx             # React Context provider + hook
├── motion/                   # animation presets
├── toast/                    # the toast BUS (tds:toast window event,
│                             #   showToast + toast.*). React-free on purpose:
│                             #   plain-TS callers (the host's dashboardLayout.ts)
│                             #   import it without pulling in the runtime.
├── components/               # shared React islands (ThemeToggle, FormAlert,
│                             #   ConfirmDialog, CookieNotice, LiveChatCta, ToastHost,
│                             #   Spinner, Skeleton, SkeletonText — their CSS lives in
│                             #   base.css, not app.css, so the landingpage (base-only)
│                             #   gets it too)
└── astro/                    # build presets (cssTarget / tdsViteBuild) +
                              #   themeBootstrapScript (the no-flash <head> script)
```

`src/__tests__/` holds the vitest suite (`npm run test` / `test:run`).

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

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
- **The dashboard colour classes are shared; tints stay flat.** `.chip--*`
  (status + `cat-*`), `.status-pill*`, `.stat-tile*` (tinted KPI tiles, 3px
  hue top-rule), `.section-accent` and `.nav-item*`. Tints follow the 45%
  border / 12% wash convention — no gradients, and no shadows except on the
  marketing surface, the only one that sets `--tds-elevation-card`.
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
├── components/               # shared React islands (ThemeToggle, FormAlert,
│                             #   CookieNotice, LiveChatCta, Spinner, Skeleton,
│                             #   SkeletonText — their CSS lives in base.css, not
│                             #   app.css, so the landingpage (base-only) gets it too)
└── astro/                    # build presets (cssTarget / tdsViteBuild)
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

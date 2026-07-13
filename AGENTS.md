# Agent notes

This is the shared library consumed by the four TDS frontends
(`tds-landingpage`, `tds-blog`, `tds-admin`, `tds-customer`). The PHP
backends do **not** import this — they duplicate the small bit of
validation they need, by design.

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
  tokens live as the `@theme` block in `styles/base.css`; Lato
  is the canonical display font (headings + wordmark), Geist the body font.
- **Colour tokens come in three families, all in `base.css` (light) +
  `:root[data-theme="dark"]` (dark).** (1) Brand: `--color-primary`/`-accent`/
  `-accent-pink` + the structural neutrals + the fixed `--color-surface-*` /
  `--color-card`. (2) Semantic status (since 0.5.x): `--color-success`/
  `-warning`/`-danger`/`-info`. (3) Categorical wayfinding (since 0.5.x):
  `--color-cat-violet`/`-teal`/`-amber`/`-rose`/`-cyan`. Every new token needs
  **both** a light and a dark value (the dark ground is navy-tinted, so the
  dark value is usually brighter), or it breaks under `data-theme="dark"`.
  The status + categorical tokens used to be duplicated in tds-admin and
  tds-customer — they live here now, so don't re-inline them into a frontend.
- **The dashboard colour classes live in `app.css`, the geometry stays
  app-local.** `.chip--*` (status + `cat-*`), `.status-pill*`, `.stat-tile*`
  (tinted KPI tiles, 3px hue top-rule), `.section-accent` (hue-coloured
  section marker) and `.nav-item*` (tinted active nav) are shared. The pill
  `border-radius` override is **not** shared — landing/blog keep round pills,
  the dashboards round to 0.75rem in their own `global.css`. All tints are
  flat (the 45% border / 12% wash convention) — no gradients, no shadows.
- **`:focus-visible` (base.css) must not set `border-radius` on the element.**
  It used to force `border-radius: 2px`, which visibly squashed every rounded
  control the moment it was focused (text inputs get `:focus-visible` on plain
  click-focus — the admin API-wiki search field went square). The outline
  follows the element's own radius in all supported browsers; only the
  outline itself is authored here.
- **`.app-version` (app.css) renders on the baseline, not superscript.** The
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
│                             #   CookieNotice, Spinner, Skeleton, SkeletonText —
│                             #   their CSS lives in base.css, not app.css, so
│                             #   the landingpage (base-only) gets it too)
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

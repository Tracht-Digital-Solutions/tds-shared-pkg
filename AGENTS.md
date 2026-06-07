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
  tokens live as the `@theme` block in `styles/base.css`; Instrument
  Serif is the canonical display font.
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
├── i18n/
│   ├── translations.ts       # DE/EN copy (no React)
│   ├── index.ts              # re-exports translations
│   └── react.tsx             # React Context provider + hook
├── motion/                   # animation presets
├── components/               # shared React islands (e.g. ThemeToggle)
└── astro/                    # build presets (cssTarget / tdsViteBuild)
```

`src/__tests__/` holds the vitest suite (`npm run test` / `test:run`).

## Publishing

CI (`.github/workflows/publish.yml`) publishes to GitHub Packages on
tagged release `v*.*.*`. To cut a release locally:

```bash
npm version patch       # or minor / major
git push --follow-tags
```

The workflow does the rest.

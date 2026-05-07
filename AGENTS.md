# Agent notes

This is the shared library consumed by the four TDS frontends
(`tds-landingpage`, `tds-blog`, `tds-admin`, `tds-customer`). The PHP
backends do **not** import this — they duplicate the small bit of
validation they need, by design.

## Rules of thumb

- **Don't promote a component or util here until at least two
  consumers actually need it.** Duplication is cheaper than the wrong
  abstraction.
- **No runtime side-effects in any module.** `sideEffects: false` in
  package.json — keep it that way so consumers tree-shake correctly.
- **No bundler-specific tricks.** This builds with `tsup` to dual
  ESM+CJS for maximum consumer compatibility (Astro frontends use
  ESM but their build pipelines occasionally fall back to CJS).
- **Brand tokens and i18n strings are the source of truth.** If you
  change a colour, font, or copy string, do it here and bump the
  version — never duplicate into a frontend.

## Layout

```
src/
├── index.ts                  # barrel — re-exports everything
├── types/                    # shared TS interfaces
├── schemas/                  # Zod schemas
├── i18n/
│   ├── translations.ts       # DE/EN copy (no React)
│   ├── index.ts              # re-exports translations
│   └── react.tsx             # React Context provider + hook
├── motion/                   # animation presets
└── brand/
    ├── tokens.ts             # raw colour/font tokens
    └── tailwind-preset.ts    # Tailwind preset frontends extend
```

## Publishing

CI (`.github/workflows/publish.yml`) publishes to GitHub Packages on
tagged release `v*.*.*`. To cut a release locally:

```bash
npm version patch       # or minor / major
git push --follow-tags
```

The workflow does the rest.

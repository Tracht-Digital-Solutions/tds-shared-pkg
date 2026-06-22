# design-sync notes — tds-shared

Repo-specific gotchas for syncing this design system to claude.ai/design.
Shape: **package** (no Storybook). Project: `tds-shared — Design System`
(`2138b4ee-6c75-46d4-9eef-8155e02bf3ca`).

## Gotchas learned

- **Component discovery misses `ThemeToggle`.** It's the only React component
  and it's a clean `export { default as ThemeToggle }` re-export, but the
  PascalCase-`.d.ts` heuristic emitted `[ZERO_MATCH]`. Pinned via
  `componentSrcMap: {"ThemeToggle": "src/components/ThemeToggle.tsx"}`. Keep that
  pin.
- **CSS must be Tailwind-compiled — this is the load-bearing step.** `tds-shared`
  ships *raw source* CSS (`styles/base.css` has `@theme inline {…}` + relies on
  the consuming app running `@import "tailwindcss"`; `ThemeToggle` styles itself
  with Tailwind utilities like `inline-flex w-9 h-9 rounded-full
  text-[var(--color-muted)] hover:…`). Those utilities exist in **no** shipped
  file, so without compilation the component renders unstyled. We compile a
  self-contained stylesheet and point `cssEntry` at it:
  `.design-sync/styles-compiled/tds.css`.
  **Regenerate it (before `package-build`/`resync`) whenever `styles/base.css`,
  `styles/app.css`, or `ThemeToggle.tsx` change:**
  ```sh
  cd tds-shared
  { echo '@import "tailwindcss" source(none);';
    echo '@source "../src/components/ThemeToggle.tsx";';
    echo '@source "_design_previews/ThemeToggle.tsx";';
    echo '';
    sed -e '/@import/d' styles/base.css; echo '';
    sed -e '/@import/d' styles/app.css;
  } > .ds-sync/_tw_input.css
  mkdir -p .ds-sync/_design_previews && cp .design-sync/previews/ThemeToggle.tsx .ds-sync/_design_previews/
  node .ds-sync/node_modules/@tailwindcss/cli/dist/index.mjs \
    -i .ds-sync/_tw_input.css -o .design-sync/styles-compiled/tds.css
  ```
  (`@tailwindcss/cli` + `tailwindcss` are installed into `.ds-sync/node_modules`
  alongside the converter deps. `source(none)` + explicit `@source` keeps the
  utility set scoped to what the DS actually uses; the `@theme inline` block is
  processed natively by Tailwind v4 so tokens emit correctly. Doc-comment
  `@import` example lines are stripped via `sed` so validate doesn't treat them
  as real imports.)
- **Fonts are bundled deliberately.** `tds-shared` never ships fonts at runtime
  (host apps add them via `@fontsource`). For design fidelity we copied the OFL
  woff2s into `.design-sync/fonts-vendor/` with a hand-written `fonts.css`, wired
  via `cfg.extraFonts`. **Geist Mono is NOT bundled** (rarely used) — suppressed
  via `cfg.runtimeFontPrefixes: ["Geist"]` so `[FONT_MISSING]` for the Geist
  family stays quiet.
- **`--entry ./dist/components/index.js`** — the DS's React export lives in the
  `./components` subpath, not the root entry (root is mostly i18n/schemas/types).
  `dist/` is prebuilt by `npm run build` (tsup); rebuild it if `src/` changed.

## Known render warns

- None. (`Default` + a `WithGermanLabels` variant rendered identically since the
  labels are aria/title-only; the redundant variant was dropped, so no
  `variantsIdentical` warn. If it's ever re-added, that warn is expected.)

## Re-sync risks (watch-list)

- **Stale compiled CSS** is the #1 risk: `cfg.cssEntry` points at a *generated*
  file (`styles-compiled/tds.css`) that `buildCmd` does NOT produce. If
  `base.css`/`app.css`/`ThemeToggle.tsx` changed and you skip the Tailwind
  recompile above, the bundle ships old tokens/utilities silently. Always
  regenerate first.
- **Vendored fonts can drift** from the apps' `@fontsource` versions — they were
  copied from `tds-landingpage/node_modules/@fontsource{,-variable}` at sync
  time. Re-copy if the brand fonts change.
- **New components** beyond `ThemeToggle` would each need a pin in
  `componentSrcMap` (same discovery miss) and a `@source` line added to the
  Tailwind compile input so their utilities compile.
- Render check / fonts only verified for the single component; a larger surface
  should re-eyeball the contact sheets.

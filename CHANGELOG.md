# Changelog

All notable changes to `@tracht-digital-solutions/tds-shared` will be
documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Vitest test suite for schemas + i18n shape (closes
  Tracht-Digital-Solutions/tds-shared#3).
- CI workflow (`type-check` + `test:run` + `build` on PR and main, closes
  Tracht-Digital-Solutions/tds-shared#4).
- This `CHANGELOG.md` (closes Tracht-Digital-Solutions/tds-shared#5).

## [0.2.0] — 2026-05-07

### Added
- Cross-island `tds:lang-change` `CustomEvent` so multiple
  `LanguageProvider` instances (Astro mounts each island as a separate
  React tree) stay in lockstep without a shared store.

## [0.1.1] — 2026-05-06

### Changed
- README expanded with install instructions (`.npmrc` + `NPM_TOKEN`)
  and a troubleshooting section for the GitHub Packages auth flow.

## [0.1.0] — 2026-05-06

### Added
- Initial scaffold:
  - `types` — `BlogPost`, `Customer`, `Project`, etc. shared across the
    frontends.
  - `schemas` — Zod validators (`ContactSchema`, `BlogPostCreateSchema`,
    `LoginSchema`) used by both the React forms and the PHP backends.
  - `i18n` — DE/EN translations + non-React entry point.
  - `i18n/react` — `<LanguageProvider>` + `useLang()` hook.
  - `motion` — shared eases for Motion animations.
  - `brand` — color tokens + Tailwind v4 preset.
- `tsup` dual ESM/CJS build with per-entry `exports` map.
- Publish workflow on `v*.*.*` tags to GitHub Packages.

[Unreleased]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Tracht-Digital-Solutions/tds-shared/releases/tag/v0.1.0

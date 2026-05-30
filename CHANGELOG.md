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

## [0.2.7] — 2026-05-30

### Changed
- Hero headline rewritten again — **0.2.6's "Maßgeschneiderte
  Software, *persönlich* entwickelt." / "Bespoke software,
  *personally* crafted."** front-loaded the right keywords but
  stayed descriptive. Replaced with **"Software, die mit Ihrem
  *Unternehmen* wächst." / "Software that grows with *your*
  business."** — same SEO weight on "Software" but now built
  around a growth metaphor + a direct pronoun ("Ihrem" / "your").
  Action-oriented headline that names the outcome buyers actually
  shop for. The italic accent shifts to the personal pronoun
  ("Unternehmen" / "your") so the brand-distinctive emphasis
  lands on what the reader cares about, not the craftsman.

### Added
- `hero.tagline` — three-keyword strapline **"Beratung · Konzept ·
  Code — alles aus einer Hand." / "Consulting · concept · code —
  all from one source."** Sits between the H1 and the brand
  slogan on the landingpage as a third title-tier banner that
  picks up secondary SEO keywords (Beratung, Konzept, Code)
  the H1 deliberately doesn't carry.

## [0.2.6] — 2026-05-30

### Changed
- Hero headline rewritten for stronger SEO + marketing punch:
  **"Digitale Lösungen, *persönlich* entwickelt."** → **"Maßgeschneiderte
  Software, *persönlich* entwickelt."** in DE, and **"Digital solutions,
  *personally* crafted."** → **"Bespoke software, *personally*
  crafted."** in EN. Front-loads the keyword pair search engines and
  buyers both scan for ("Maßgeschneiderte Software" / "Bespoke
  software") while preserving the brand-distinctive italic emphasis
  on "persönlich" / "personally". The footer slogan **"Digitales
  Handwerk für den Mittelstand."** carries the audience-narrowing
  "Mittelstand" claim, so the H1 doesn't need to repeat it.

## [0.2.5] — 2026-05-30

### Changed
- Project CTA copy rewritten again — **"Projekt starten"** / **"Start
  a project"** read professionally but had no character. Replaced
  with **"Idee skizzieren"** / **"Sketch an idea"** across `nav.cta`,
  `hero.cta1`, and `pricing.ctaButton`. Low-commitment, creative,
  matches the editorial brand voice.
- `footer.tagline` slimmed down — the locality clause survives, the
  rest of the descriptive sentence is replaced by the new
  `footer.slogan`.

### Added
- `footer.slogan` — **"Digitales Handwerk für den Mittelstand."** /
  **"Digital craft for the mid-market."** Brand-tier line above the
  full tagline.
- `tech.body` — one-line description added between the Tech section
  header and the marquee ("Werkzeuge, die sich in zehn Projekten
  bewährt haben…").
- `process.body` — one-line framing on Process section ("Kein
  Standard-Workflow. Je nach Projekt und Aufgabe variieren die
  Phasen…").
- `consulting` — new section bundle (`label`, `headline`,
  `headlineAccent`, `body`, `primaryCta`, `secondaryCta`) for the
  upcoming consulting / digitalization CTA section on the landingpage.

## [0.2.4] — 2026-05-29

### Changed
- CTA copy rewritten again. **"Pläne schmieden"** / **"Forge a plan"**
  read too artisanal for the mid-market business audience; replaced
  with the more professional **"Projekt starten"** / **"Start a
  project"** across `nav.cta`, `hero.cta1`, and `pricing.ctaButton`.

## [0.2.3] — 2026-05-29

### Changed
- Project CTA copy across `nav.cta`, `hero.cta1`, and
  `pricing.ctaButton` rewritten from "Projekt besprechen" /
  "Start a project" to **"Pläne schmieden"** / **"Forge a plan"**
  — keeps the action verb but picks up the artisanal,
  forge-metaphor voice the rest of the brand uses.

## [0.2.2] — 2026-05-29

### Added
- `translations.services.items[4]` — a fifth offering, **Schnelles
  Prototyping** / **Rapid Prototyping**, with Figma + React +
  TypeScript + Claude as the tag set. tds-landingpage had been
  carrying this as an inlined extra item; it now ships from the
  shared bundle.

### Changed
- Replaced the generic Mustermann / Jane Smith placeholders on
  `contact.form.*Placeholder` with warmer, story-style examples
  ("Hanna Schmidt" at "Schmidt Manufaktur" in DE; "Alex Marlow"
  at "Marlow Studios" in EN). The message placeholder now reads as
  an opening line a real prospect might write rather than a
  generic instruction.

## [0.2.1] — 2026-05-28

### Changed
- `translations.en` audit pass — repaired Germanisms, awkward phrasings
  and one inverted portrait description. Highlights:
  - `hero.cta1 / nav.cta` "Discuss a project" → "Start a project".
  - `hero.cta2` "Discover services" → "Explore services".
  - `hero.sub` softened "thought through individually" → "approached on
    its own terms".
  - `about.portraitPlaceholder` direction restored — German says "turned
    toward the camera", English had "looking off-camera".
  - `about.stat1Label` "Years experience" → "Years of experience".
  - `about.stat3Label` "Personal collaboration" → "Personal support".
  - `services.items[2].title` "Fullstack Engineering" → "Fullstack
    Development" (consistent with sibling entries).
  - `services.items[2].description` "all from one hand" Germanism → "all
    from a single developer".
  - `pricing.items[0].title` "Consulting & Concept" → "Consulting &
    Strategy". `includes` list dropped German-style hyphenated compounds
    and the "decision foundations" calque.
  - `pricing.items[3].description` German word order
    ("outside standard business hours possible") → "after-hours support
    available on request".
  - `pricing.ctaSub` "informal, free" → "no obligation, free" (closer to
    "unverbindlich").
- No API or type changes — pure copy refresh.

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

[Unreleased]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.2.7...HEAD
[0.2.7]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Tracht-Digital-Solutions/tds-shared/releases/tag/v0.1.0

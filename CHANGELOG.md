# Changelog

All notable changes to `@tracht-digital-solutions/tds-shared` will be
documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.2] — 2026-06-24

### Added
- **Bold navy sidebar surface.** `.portal-sidebar` is now a fixed deep-navy
  panel (`--color-surface-navy`) in both light and dark mode, with light
  text/icons. Built by re-mapping the structural tokens (`--color-ink`,
  `--color-muted`, `--color-line`, `--color-soft`, `--color-card`, `--nav-hue`)
  to light/translucent-white *within the panel*, so every existing child reads
  light without per-element edits. The active nav item gets a translucent-white
  fill + white indicator; the wordmark italic + admin quick-action use
  `--color-accent-pink` on navy; the floating expand button and `.nav-tip`
  tooltip opt back out (they belong to the page surface).

### Changed
- `.brand-header` bottom rule is now a 2px hue-tinted line
  (`color-mix(--color-primary 30%, --color-line)`) for a touch of brand colour
  on the sticky top bar (the `backdrop-filter` authoring is unchanged).
- `.section-accent` reads stronger: the `.section-num` eyebrow is hue-tinted
  (70% toward `--section-hue`) and its leading rule widened to 2rem.

## [0.5.1] — 2026-06-24

### Added
- **Semantic status colour tokens** in `styles/base.css` — `--color-success`,
  `--color-warning`, `--color-danger`, `--color-info`, each with a light value
  and a brighter dark value tuned for the navy ground. These were previously
  **duplicated, byte-identically, in both `tds-admin` and `tds-customer`**
  `global.css`; they now live here as the single source of truth.
- **Categorical / wayfinding hues** — `--color-cat-violet`, `--color-cat-teal`,
  `--color-cat-amber`, `--color-cat-rose`, `--color-cat-cyan` (light + dark).
  A non-semantic set for category coding and nav wayfinding (blog categories,
  project types, per-section header accents).
- **Dashboard surface classes** in `styles/app.css` so the admin + customer
  panels share one definition: `.chip--{neutral,success,warning,danger,info}`
  and `.chip--cat-*`; the `.status-pill` family (moved out of tds-admin); and
  the "lively dashboard" surfaces `.stat-tile` / `.stat-tile--toned` /
  `.stat-tile--hi` / `.stat-tile__icon` (tinted KPI tiles with a 3px hue
  top-rule), `.section-accent` (hue-coloured `.section-num` marker) and
  `.nav-item` / `.nav-item--active` (tinted active nav + 2px left indicator).
- A documented **tint convention** in `base.css` (45% border / 12% wash / raw
  token text / 9%+35% tile) so the colour maths stays consistent.

### Notes
- Flat tints only — no gradients or drop shadows (the editorial brand rule
  holds). Consumers drop the duplicated palette + chip variants from their
  `global.css` and bump to `^0.5.0`; only app-local pill *geometry*
  (`border-radius`) stays in each frontend.
- Published as `0.5.1` (the manual Release workflow auto-bumps the patch on
  publish; `0.5.0` was the development tag that introduced the work).

## [0.4.2] — 2026-06-17

### Changed
- Retuned the dark-mode surface palette (`:root[data-theme="dark"]`):
  adjusted `--color-paper`, `--color-soft`, `--color-line`, `--color-muted`,
  `--color-card`, `--color-surface-ink`, `--color-surface-navy` and
  `--color-surface-accent` for higher contrast and a more cohesive navy
  elevation ladder. Token names and structure are unchanged — only the hex
  values moved, so consumers inherit the new look on their next build.

## [0.4.1] — 2026-06-15

### Changed
- i18n: switched all German copy to the formal *Sie* address (previously
  informal *du*) across the about, services, process, contact and pricing
  strings.
- Revised the services list: renamed "App-Entwicklung" →
  "Desktop- bis Mobile-Anwendungen", dropped the standalone Fullstack item and
  renumbered, and reframed prototyping as "Schnelle Konzepte zugeschnitten auf
  Ihr Vorhaben".
- CI: bumped `actions/checkout` + `actions/setup-node` to v5 (Node 24).

## [0.4.0] — 2026-06-03

### Added
- **Shared Astro build preset** at `./astro`. Exports `cssTarget`
  (`["chrome90", "edge90", "firefox103", "safari15"]`) and the drop-in
  `tdsViteBuild` fragment (`{ cssMinify: "lightningcss", cssTarget }`).
  Frontends spread it into `vite.build` so every site pins the same
  lightningcss prefixing floor in one place. Without the Safari target,
  lightningcss ships `backdrop-filter` unprefixed-only and the frosted
  `.brand-header` blur silently dies in Safari ≤17 — no error, no test.
  Replaces the hand-copied `cssTarget` array each frontend carried. See
  tds-shared#10.

## [0.3.1] — 2026-06-03

### Fixed
- `styles/app.css` `.field-boxed` now uses `var(--color-card)` instead of
  a hardcoded `white`, so boxed inputs follow the theme. Light mode is
  unchanged (`--color-card` is `#ffffff`); dark mode no longer renders a
  white box on the dark ground.

## [0.3.0] — 2026-06-03

### Added
- **Shared design-system stylesheets.** `./styles/base.css` is now the
  single source of truth for the brand `@theme` tokens, the dark theme,
  base element resets, the brand scrollbar, the focus ring, the animated
  theme-switch and the editorial type primitives. `./styles/app.css`
  ships the shared application chrome (chips, buttons, fields, the sticky
  header shell, hairlines, drop-cap, link/row interactions) for the
  dashboard/content frontends. The four frontends previously duplicated
  ~130 identical CSS lines each and had drifted.
- **Shared `ThemeToggle` React component** at `./components` — the
  circular-reveal View-Transition toggle, with optional `labelToDark` /
  `labelToLight` props. Replaces the per-app island copies.

### Changed
- **Instrument Serif is now the single canonical display font** across
  all frontends (previously the landingpage used Instrument Serif while
  admin/blog/customer used Fraunces).

### Removed
- Stale, unused `./brand` (`tokens.ts`) and `./brand/tailwind-preset`
  exports. They referenced the wrong fonts and a Tailwind-v3 preset shape
  while the frontends run Tailwind v4 with `@theme`; nothing consumed
  them. The brand tokens now live in `./styles/base.css`.

## [0.2.9] — 2026-06-01

### Changed
- Replaced the placeholder `contact.info.email` and `contact.info.phone`
  values with the real production contact: **kontakt@tracht-digital.de**
  (DE) / **contact@tracht-digital.de** (EN), both phones now read
  **+49 178 822 4022**. `info.location` unchanged.

## [0.2.8] — 2026-05-30

### Changed
- Hero headline rewritten one more time, aiming for a more
  professional + creative read. **0.2.7's "Software, die mit
  Ihrem *Unternehmen* wächst." / "Software that grows with *your*
  business."** named an outcome buyers shop for, but stayed in
  marketing-tagline territory. Replaced with **"Maßgefertigte
  Software, die *Bestand* hat." / "Bespoke software, built *to
  last*."** Durability-focused instead of growth-focused — speaks
  to a mid-market buyer's actual fear (will this still work in
  three years?) rather than just promising "more". Strong SEO via
  "Maßgefertigte Software" / "Bespoke software"; the italic
  accent shifts to "Bestand" / "to last" so the promise is
  visually anchored.

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

[Unreleased]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.5.2...HEAD
[0.5.2]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.4.2...v0.5.1
[0.4.0]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.2.9...v0.3.0
[0.2.9]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.2.8...v0.2.9
[0.2.8]: https://github.com/Tracht-Digital-Solutions/tds-shared/compare/v0.2.7...v0.2.8
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

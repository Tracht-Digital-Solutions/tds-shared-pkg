# Changelog

All notable changes to `@tracht-digital-solutions/tds-shared` will be
documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

> **Release this as a `minor` → it must publish as `0.14.0`.** Every consumer of
> this change pins `^0.14.0` (products/host) or `>=0.14.0` (extensions), so any
> other number leaves 21 repos unable to resolve the dependency.
>
> The `version` field was reconciled `0.12.3` → `0.13.0` in this change, because
> it had drifted **behind the registry**: `0.13.0` was published on 2026-07-25,
> but the release workflow's `git push --follow-tags origin HEAD:main` never
> landed, so `main` kept the pre-release value and no `release: 0.13.0` commit or
> `v0.13.0` tag exists. Left at `0.12.3`, `npm version minor` would recompute
> `0.13.0` and `npm publish` would fail with a 409 (version already exists).
> Reconciling the field is not taking the bump by hand — it restores what the
> workflow itself would have written, so its own arithmetic lands on `0.14.0`.
> If a release ever 409s again, check `npm view … versions` against `main`'s
> `version` before touching anything else.

### Changed
- **One design library, three surfaces.** The design was maintained as three
  divergent variations — landingpage (round/pills), panel (8px), blog
  (`kantig`/flat, radius 0) — because the repo convention was *"colour lives in
  shared CSS; geometry stays app-local"*. That convention is **reversed**:
  geometry, elevation, motion and display type are now surface-layer tokens.
  Each app sets `data-surface="marketing|blog|panel"` on `<html>` and imports
  one `styles/surfaces/*.css`; it no longer hand-authors radii or re-declares
  shared classes. New layer stack: `base.css` → `primitives.css` →
  (`prose.css` / `app.css`) → `surfaces/<surface>.css`.
  **The surface defaults are today's literals**, so a surface that has not yet
  opted into a layer renders byte-identically to before.
- **`app.css` is split.** Its cross-surface half moved to the new
  `primitives.css`; `app.css` now `@import`s that (so it stays drop-in for
  existing consumers) and keeps only dashboard chrome — `.portal-sidebar`,
  `.nav-drawer*`, `.nav-item*`, `.stat-tile*`, `.section-accent`,
  `.editorial-grid`, `.dashboard-grid`. This is what finally gives the
  landingpage `.section-num` and `.brand-wordmark`: it skipped `app.css`
  wholesale, so both classes shipped **unstyled** on tracht-digital.de.
- **Body and mono fonts unified to Plus Jakarta Sans + JetBrains Mono.**
  Previously three states: blog and panel shipped this pair, the landingpage
  and central login were on Geist, and `--font-mono` resolved to nothing on
  the landingpage because `@fontsource-variable/geist` is sans-only and Geist
  Mono was never installed. Consumers must JS-import
  `@fontsource-variable/plus-jakarta-sans` + `@fontsource-variable/jetbrains-mono`
  in `Layout.astro`. `--font-display` (Lato) also picks up the better
  `"Helvetica Neue", Arial` fallback chain that all three apps had been
  re-declaring locally.
- **`.display` / `.display-tight` / `.eyebrow` read their weight, tracking and
  leading from surface tokens**, so the landingpage's 700 and the blog's 800
  display voice no longer require forking the class.
- **`.dashboard-grid` is an actual grid.** It carried no `display` property at
  all, so the panel dashboard's "grid" was a plain block stack. Widgets size
  via `data-size="md|lg"`.
- **Callout radius follows the surface**, so on the blog a callout is finally
  square — it had a hard-coded `0.4rem` that the blog's own AGENTS.md flagged
  as breaking the flat kit.

### Fixed
- **`--color-border` now resolves.** It was referenced at 27 call sites across
  8 repos (all four `tds-tool-*` packs, ext-website-cms, ext-tools, the panel
  host) and **defined nowhere**, so every one of those borders silently fell
  back to `currentColor`. Added as a documented alias of `--color-line`; being
  a `var()` reference it re-resolves in dark mode automatically.
- **Panel chips render with colour again.** `.chip--violet` / `--teal` /
  `--amber` / `--rose` matched no rule (the real names are `--cat-`prefixed),
  leaving the Admin / Support-Agent / Blog-Autor / Gesperrt / Panel-Nutzer
  badges completely unstyled. Call sites corrected.

### Added
- **`styles/primitives.css`** — the cross-surface component layer, with all
  geometry expressed through tokens. Beyond the classes moved out of
  `app.css`, it adds the primitives the panel and extensions referenced but
  never defined (~96 orphan BEM names): `.tds-card`, `.tds-page` (+`__head`,
  `__title`, `__lede`), `.tds-widget` (+`__title`, `__metric`),
  `.tds-settings-section`, `.tds-list` (+`__row`), `.tds-table`, `.tds-empty`,
  `.tds-alert`, `.tds-modal` (+`__panel`, `__title`, `__actions`),
  `.tds-toolbar`, `.tds-field-row`, `.tds-toggle-row`,
  `.tds-thread` (+`__item--own`/`--other`, `__author`) and
  `.btn-danger`. Note `.tds-page__title` exists because Tailwind preflight
  strips heading sizes, so every extension page title rendered at body size.
- **`styles/prose.css`** — `.tds-prose`, promoted from the blog's
  `.prose-article` (the only long-form typography in the project). Also serves
  the blog-CMS markdown preview, which asked for `@tailwindcss/typography`'s
  `prose` class — a plugin installed in no product, so that preview had always
  rendered unstyled. Includes `.tds-callout*`, `.tds-block-button`,
  `.tds-video-embed`, `.tds-block-embed`.
- **`styles/surfaces/{marketing,blog,panel}.css`** — token-only layers,
  scoped to the bare `[data-surface="…"]` attribute (not `:root`) so a blog
  surface can nest inside a panel surface for the CMS preview.
- **Surface token scale in `base.css`** (plain `:root`, deliberately not
  `@theme inline` — that would inline the literals into Tailwind's utilities
  and make them unoverridable): `--tds-radius-*` (scale + per-component
  `-btn`/`-chip`/`-badge`/`-input`/`-card`/`-alert`), `--tds-shadow-*` +
  `--tds-elevation-*`, `--tds-ease-*` + `--tds-dur-*`, and the display-type
  tokens.
- **`/design` subpath** — `resolveChipVariant()` (+ `isKnownChipColor`,
  `CHIP_VARIANTS`, `SURFACES` and types). Required for the support-ticket
  board, which interpolated a status colour straight out of the
  `support_tickets_status` table: Tailwind cannot statically extract an
  interpolated class name, and an admin could type a value matching no
  variant. Unknown input falls back to `neutral`.
- **`.nav-group-label`** — promoted from the panel host's `global.css`, which
  was the only component class it owned.
- **`.tds-settings-section__body`** — the content wrapper an extension renders
  for its own settings slot. Deliberately *not* `.tds-settings-section`: the
  Einstellungen host already wraps every contributed panel in one, so an
  extension using the outer class too would nest a card inside a card (double
  border, padding and background). 10 extensions use it.
- **`.tds-alert--success` / `--warning` / `--danger`** — hue modifiers, so a
  consumer doesn't need an inline style (and, in TSX, a `CSSProperties` cast)
  just to change the tone. Setting `--tds-alert-hue` inline still works for a
  one-off hue such as a categorical colour.

### Added — generic layout primitives
- **`.tds-stack`** (+ `--tight` / `--loose`) and **`.tds-row`** (+ `--between`,
  plus a `button.tds-row` reset so an expandable card header reads as a header)
  and **`.tds-compose`** (+ `__actions`). Deliberately unopinionated — spacing
  only, no surface, no border — so they compose inside `.tds-card` /
  `.tds-widget` / `.tds-page`.
  These three absorb **46** of the per-extension orphan class names, because the
  "bespoke" internals turned out to be the same handful of shapes over and over:
  a form body / detail region (stack), a header row / filter bar / tab strip
  (row), and a reply box (compose). Two more groups needed no new primitive at
  all — `*__actions` / `*__toolbar` map onto the existing `.tds-toolbar`, and
  `*__meta` / `*__hint` onto the existing `.marginalia`.

### Added — `<ConfirmDialog>`, replacing `window.confirm()`
- **`ConfirmDialog`** in `tds-shared/components`, plus the `.tds-modal*` CSS it
  needs. Built on the native **`<dialog>` + `showModal()`**, which is what makes
  it an accessibility improvement rather than a reskin: the browser provides the
  focus trap, `Escape`-to-dismiss, `inert` background, focus restoration to the
  trigger, and top-layer stacking (no `z-index` can bury it). An earlier draft of
  the CSS was a `div` overlay with `data-open` and a hand-rolled backdrop
  element; it had to re-implement all of that. `design.test.ts` now guards
  against that revert (no `z-index`/`position: fixed`, no `[data-open]`).
- Auditing every `method: "DELETE"` against its gate found **only 3 of 10
  destructive actions confirmed at all**. The three `window.confirm()` calls were
  the visible half of the problem; the invisible half was seven deletes with no
  prompt whatsoever. Now gated: users (host), blog authors, **blog posts**,
  **invoices**, **customers**, **FAQ entries**, **docs**, **projects**,
  **milestones** — nine in total.
  - **Deliberate exception:** the time-tracker's per-entry delete stays ungated.
    It is a single self-owned row in a high-frequency list, where a prompt on
    every correction is friction rather than protection. The line drawn is *gate
    what cascades or what another party depends on* — not every `DELETE`.
  - The milestone delete is gated even though its trigger is a bare „×", because
    a tiny control beside a title is exactly what a misclick hits.
- Two behaviours the native dialog does *not* give you, so the component does:
  - **Focus is set imperatively after `showModal()`,** not via React's
    `autoFocus` prop. React never renders `autoFocus` as an HTML attribute (it
    focuses on mount instead), so `showModal()`'s own focusing steps run
    afterwards, find no `[autofocus]`, and settle on the first focusable
    element. The prop was silently doing nothing. For a destructive prompt
    focus starts on **Cancel**, and Cancel is also first in DOM order so a
    platform ignoring the explicit call still lands somewhere safe.
  - **`showModal` is feature-detected** with an `open`-attribute fallback. Not a
    test concession: a bare `<dialog>` without `open` is `display: none`, so on
    any platform lacking the method the dialog would silently never appear —
    and since it gates destructive actions, the action would become
    *unreachable*, not merely unstyled. (jsdom ≤25 implements none of the
    `<dialog>` methods, which is how this surfaced.)
  - `busy` disables both buttons and ignores backdrop clicks while the action is
    in flight — double-submit protection that blocking `window.confirm()` gave
    away for free.

### Removed (never released — shipped no consumers)
- **`.tds-search-field`** and **`.tds-toolbar__spacer`**. Don't ship a primitive
  nothing uses. `.tds-search-field` is a wrapper for an icon + input, and the
  only search input in the platform (the API-wiki filter) is a bare input with
  no icon — it uses `.field-boxed` instead. `.tds-toolbar__spacer` was
  `margin-left: auto`, which Tailwind's `ml-auto` already provides.
  `.tds-alert--success` / `--warning` are deliberately kept despite having no
  consumer yet: a three-line modifier completing an obvious axis on a
  29-consumer primitive is discoverability, not a speculative abstraction.

### Not done (deliberate, tracked)
- Four known duplicates are **not** promoted, because AGENTS.md requires two
  real consumers and wiring them means surgery on large visual components
  (`Header.astro` 453 lines, `JournalHeader.astro` 541 lines) that does not
  belong in the same change as the token unification: the hamburger bars (the
  blog's `.jnl-menu-bar*` is a verbatim copy of the landingpage's
  `.menu-bar*`), the reading-progress bar (2px gradient island vs 3px solid
  script), the `[data-reveal]` scroll-reveal primitive, and the `.brand-logo`
  CSS-mask logomark (better than the landingpage's
  `filter: brightness(0) invert(1)` raster hack, but needs a single-colour
  silhouette asset the landingpage does not ship). See the note at the bottom
  of `styles/primitives.css`.
- **`src/__tests__/design.test.ts`** — 43 tests guarding the contracts that
  fail silently: surface tokens present, geometry kept out of `@theme inline`,
  surface layers attribute-scoped and token-only, no `999px` literal left in
  primitives, `.btn` vs `.btn-*` split intact, `backdrop-filter` unprefixed,
  no `border-radius` under `:focus-visible`, and the chip catalog matching the
  `.chip--*` rules that actually exist.

- **Display font is now Lato, not Hanken Grotesk.** `--font-display` moves to
  **Lato** — the official Tracht Digital Solutions brand font — so the whole
  brand (display headings + `.brand-wordmark`) reads in Lato. Body/mono fonts are
  unchanged (Geist on the landingpage, Plus Jakarta Sans on the frontends, JetBrains
  Mono). Lato ships as the static `@fontsource/lato` package (weights 400/700/900),
  so consumers import `@fontsource/lato/{400,700,900}.css` instead of the variable
  `@fontsource-variable/hanken-grotesk`. Hanken Grotesk is retired as the display
  face.

### Added
- **Block-based blog document model + slash-menu catalog.** New
  `schemas/blogBlocks` module: `BlogBlockSchema` (a discriminated union of
  `heading`/`paragraph`/`list`/`quote`/`code`/`image`/`divider`/`callout`/
  `button`/`video`/`adsense`/`custom`), `BlogDocumentSchema`
  (`{ version: 1, blocks: [...] }`), `emptyBlogDocument()`, and the `BLOG_BLOCKS`
  slash-menu catalog (`BlockCatalogItem`, with an `integration` gate for AdSense).
  Text fields carry inline markdown. Types (`BlogBlock`, `BlogBlockType`,
  `BlogDocument`, `BlockCatalogItem`, `BlogBodyFormat`) are re-exported type-only
  from the default barrel. `BlogPost` gains an optional `bodyFormat`
  (`"markdown" | "blocks"`) and `BlogPostCreateSchema` a `bodyFormat` field
  (default `"markdown"`) — a post's `body` is either a markdown string or a JSON
  `BlogDocument` string. Backs the tds-admin block editor + tds-blog-frontend renderer.
- **`CookieNotice` consent mode + ad-consent helpers.** A new `consent` prop
  turns the notice into a real advertising-consent gate (Akzeptieren / Ablehnen)
  for the blog when AdSense is enabled, storing the choice under `tds-ad-consent`
  and firing an `AD_CONSENT_EVENT` so ad loaders react without a reload. New
  exports `getAdConsent` / `setAdConsent` / `AD_CONSENT_KEY` / `AD_CONSENT_EVENT`
  / `AdConsent`. The informational one-time notice stays the default (unchanged
  for the frontends + the ad-free landingpage). New `cookieNotice.consentText`/
  `consentAccept`/`consentDecline` i18n (DE/EN) + a `.cookie-notice-btn--ghost`
  style in `base.css`.
- **`BlogPost.adsMode` + `AdsMode` type + Zod.** Per-post ad rendering mode
  (`default|off|auto|manual`) on `BlogPost` and `BlogPostCreateSchema` (mirrors
  the content-api PHP validator).
- **`Spinner`, `Skeleton`, `SkeletonText` shared loading indicators.** One
  consistent, brand-token loading system for all frontends. `Spinner` is a
  rotating ring (`sm`/`md`/`lg`, `currentColor` by default so it shows inside a
  primary button, or `tone="primary"`); `Skeleton` is a pulsing placeholder
  block (width/height/radius/`circle`); `SkeletonText` stacks placeholder lines.
  Styling ships as `.tds-spinner` / `.tds-skeleton` (+ `tds-spin`,
  `tds-skeleton-pulse` keyframes) in `styles/base.css` (base, not app.css, so
  the landingpage gets it too). The global reduced-motion clamp freezes both to
  a static ring/block. Replaces the ad-hoc `Wird geladen …` text lines and
  button label swaps across the frontends.
- **`CookieNotice` shared island + cookie/privacy copy.** Dismissible
  one-time cookie/Datenschutz notice used by all four frontends: variant
  `"site"` (public landingpage/blog wording — no tracking cookies, only
  local preferences) and `"frontend"` (admin/customer wording — one technically
  necessary session cookie). Dismissal persists per origin in localStorage
  (`tds-cookie-notice`). Copy ships as the new `cookieNotice` i18n block
  (DE/EN); styling as the `.cookie-notice` block in `styles/base.css`
  (base, not app.css, because the landingpage imports only base). New
  `CookieBannerBlock` type mirrors the language-agnostic `cookie_banner`
  landing content block in tds-content-api that toggles the banner on the
  public sites at build time.
- **Multi-company logins (`memberships`).** A login can now belong to several
  companies, each with its own permission set. New `PortalMembership` type +
  `MembershipSchema`; `AppUser` gains `memberships` and `Me` gains `companies`
  (both keep the legacy single-company `customerId`/`permissions` as the
  primary/default for backward compatibility). `UserCreateSchema` /
  `UserUpdateSchema` accept `memberships` (the legacy `customerId`+`permissions`
  pair still works as a single-membership fallback). Mirrors the new
  `app_user_customer` table in tds-auth-api and per-company RBAC in
  tds-customer-api.

- **Ticket/support system shared contracts.** `PORTAL_PERMISSIONS` gains
  `tickets:read` / `tickets:write` (with German labels and inclusion in the
  `full` / `project_team` / `read_only` presets), for the new customer-portal
  support tickets. New Zod schemas `TicketCreateSchema` / `TicketCommentSchema`
  plus the `TICKET_PRIORITIES` / `TICKET_TYPES` value lists and matching
  `TicketPriority` / `TicketType` enums. New TS types `Ticket`, `TicketComment`,
  `TicketStatus`, `TicketAttachment`. Ticket *status* is intentionally not an
  enum — it is admin-configurable at runtime (a `ticket_status` registry in
  tds-customer-api) and travels as a numeric id.
- **`isSupportAgent` on the identity model.** `AppUser` and `Me` gain
  `isSupportAgent: boolean` (the subset of admins tickets can be assigned to),
  and `UserCreateSchema` / `UserUpdateSchema` accept it. Mirrors the new
  `is_support_agent` column in tds-auth-api.

## [0.8.4] — 2026-07-03

### Changed
- **Display font is now Hanken Grotesk, not Instrument Serif.** `--font-display`
  moves to the modern grotesk already used by the blog/admin/customer apps, so
  the whole brand (display headings + `.brand-wordmark`) reads in one flat,
  contemporary sans. `.display`/`.display-tight` gain real weight (700/600) to
  suit the grotesk, and the wordmark accent word renders upright (no serif
  italic). Consumers import `@fontsource-variable/hanken-grotesk` instead of
  `@fontsource/instrument-serif`. Instrument Serif is retired brand-wide.

## [0.5.2] — 2026-06-24

### Added
- **Bold navy sidebar surface.** `.portal-sidebar` is now a fixed deep-navy
  frontend (`--color-surface-navy`) in both light and dark mode, with light
  text/icons. Built by re-mapping the structural tokens (`--color-ink`,
  `--color-muted`, `--color-line`, `--color-soft`, `--color-card`, `--nav-hue`)
  to light/translucent-white *within the frontend*, so every existing child reads
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
  **duplicated, byte-identically, in both `tds-admin` and `tds-customer-legacy-frontend`**
  `global.css`; they now live here as the single source of truth.
- **Categorical / wayfinding hues** — `--color-cat-violet`, `--color-cat-teal`,
  `--color-cat-amber`, `--color-cat-rose`, `--color-cat-cyan` (light + dark).
  A non-semantic set for category coding and nav wayfinding (blog categories,
  project types, per-section header accents).
- **Dashboard surface classes** in `styles/app.css` so the admin + customer
  frontends share one definition: `.chip--{neutral,success,warning,danger,info}`
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
  tds-shared-pkg#10.

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
  TypeScript + Claude as the tag set. tds-landingpage-frontend had been
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

[Unreleased]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.5.2...HEAD
[0.5.2]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.4.2...v0.5.1
[0.4.0]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.2.9...v0.3.0
[0.2.9]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.2.8...v0.2.9
[0.2.8]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/releases/tag/v0.1.0

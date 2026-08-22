# Changelog

All notable changes to `@tracht-digital-solutions/tds-shared` will be
documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **`AccountMenu` — the signed-in visitor, top right, on a PUBLIC site.** The
  session cookie is `Domain=.tracht-digital.de`, so a login at
  `auth.tracht-digital.de` was always valid on `blog.` and `tools.` — and both
  sites showed a signed-in customer exactly what they show a stranger, with no
  way back into the portal. The island is the public twin of the frontend
  host's `UserMenu` and reuses the existing `.tds-dropdown*` / `.tds-avatar*`
  primitives, which needed no change: they carry no `[data-surface]` scope, so
  they already rendered correctly on `data-surface="blog"` (now pinned by
  `design.test.ts`).
  - `src/components/accountAuth.ts` is the transport half:
    `accountEndpoints`/`fetchAccount`/`tryRefreshAccount`/`logoutAccount` plus
    the hint and `?next=` helpers, all exported from `/components`.
  - **Reads may follow `apiBase`; writes that set a cookie may not.**
    `install/proxy.php` deliberately drops `Set-Cookie`, so a `DELETE /logout`
    through the same-origin proxy answers 200 and ends nothing — success
    reported, session alive, header signed back in after the reload. A
    configured `authBase` is therefore accepted **only when absolute**, and the
    relative `/api/auth` a proxy install publishes is rejected on purpose.
  - Logout is **`DELETE`** (a POST answers 405, which a `catch` cannot see) and
    **reloads** rather than redirecting to a login form the reader did not ask
    for — the panel's redirect exists only because the panel has nothing to
    show a signed-out visitor.
  - A signed-out visitor is a first-class state: `loggedOut="nothing"` (blog) or
    `loggedOut="login"` (tools). The sign-in link paints immediately rather than
    after the probe, because on a public site the anonymous visitor is the
    common case.
  - The `tds_pub_account` hint gates the remember-me refresh, not just the
    placeholder width: without it every anonymous reader would pay a
    `POST /refresh` plus a re-probe on every page view. It also caches the
    display name (`tds_pub_account_label`), because reserving the avatar alone
    leaves a ~66px trigger against a settled ~154px and both public headers
    give their nav a `flex-1` — so the whole bar slid sideways when the name
    arrived. Measured in a browser; no test sees a layout shift.
  - `install/profiles/blog.php` gained `GET /auth/me` and `loginUrl`;
    `installer.test.ts` now fails a profile that has one without the other.
  - `Me` gained the five optional fields `/me` really returns (`displayName`,
    `label`, `hasAvatar`, `mustChangePassword`, `expiresAt`).
- **A fluid layout scale: `.tds-shell`, `.tds-grid-auto`, and seven tokens.**
  Page width was not a decision anywhere — it was a container utility copied
  per call site (`tds-blog-frontend` carried `max-w-5xl mx-auto px-6` in **22**
  files), which is why nothing on that site changed shape above 1024px: to
  widen it you had to edit 22 files, and so nobody ever did.
  - `--tds-shell-max` (90rem), `--tds-shell-wide`, `--tds-shell-article`,
    `--tds-shell-prose`, `--tds-measure` (65ch), `--tds-grid-min` (16rem) and
    `--tds-gutter` (a `clamp()`), all in the plain `:root` — never
    `@theme inline`, or a consumer could not override them.
  - `.tds-shell` centres and gutters a page; `.tds-shell--wide` is the roomier
    variant.
  - `.tds-grid-auto` is an intrinsic grid with **no breakpoint at any width**:
    `auto-fill` derives the column count from the space the grid actually has,
    so it answers a wider page or a collapsed sidebar without either side
    knowing about the other. The `min(100%, …)` inside its `minmax()` is the
    overflow guard and is not optional — a bare `minmax(16rem, 1fr)` overflows
    any narrower viewport, and `body { overflow-x: hidden }` **clips** that
    rather than revealing it.
  - **Token names may not contain digits.** The existing "surface references
    only tokens base.css defines" test scans with `/var\((--tds-[a-z-]+)/` — a
    class with no `0-9` — so `var(--tds-space-3xl)` is captured as
    `--tds-space-` and the assertion fails naming a token nobody wrote. A new
    test forbids the shape outright rather than widening that pattern.
    (`--tds-radius-2xl` survives only because no surface file references it.)
  - Deliberately **not** added: a Utopia-style type/space scale. `base.css`
    carries no spacing or font-size scale on purpose and every app already has
    Tailwind's; a second competing scale across seven repos for one consumer
    would be a reversal, not an addition.

### Changed
- **`.tds-prose` scales its body size and tokenises its measure.**
  `font-size` is now `clamp(1.0625rem, 1.02rem + 0.2vw, 1.1875rem)` and
  `max-width` reads `var(--tds-measure, 65ch)`.
  Only the **size** is viewport-derived; the **measure** stays a `ch`
  `max-width`, and that split is what keeps this safe for all four consumers —
  two of them (`tds-core-frontend-pkg`'s `HelpCenter`, the blog-cms markdown
  preview) render inside the panel, where the viewport says nothing about the
  available column width and a `vw`-derived measure would overflow it.
  The `65ch` fallback means consumers still on an older `base.css` render
  byte-identically.
- **The brand hues take their assigned INTERFACE roles, not just decorative
  ones.** Three of the five palette colours were effectively invisible in the
  running design — `--color-cranberry` had exactly ONE call site in the whole
  library, gold three, coral five, all of them decoration, while
  `--color-muted` (grey) carried 29. The brand direction assigns each a job;
  those jobs are now filled:
  - **`.eyebrow` is cranberry**, through a new `--tds-eyebrow-color` token so a
    surface can opt out without forking the class ("kleine Labels"). 7.29:1 on
    paper.
  - **`.section-num` is bordeaux** ("Kapitelmarken"), and its 24px rule is
    **solid gold** ("kurze Linie") — the `opacity: 0.5` is dropped, because at
    half opacity gold lands near 1.8:1 where a graphic needs 3:1. It is also no
    longer `currentColor`, so it stays gold on white-labelled dark sections.
  - **Row hovers are a coral wash** via the new `--tds-hover-wash`
    ("Hoverzustände"). `.tds-list__row`, `.tds-table tbody tr` and `.entry-row`
    all used the neutral sand, so the warmest hue in the palette was doing no
    work in the interface at all.
  - **`.tds-tone-navy` / `.tds-tone-ink` re-point the eyebrow to coral**, since
    cranberry is a deep red and measures 2.16:1 on the navy. A safety net —
    every eyebrow in a dark tone today already carries its own white utility.

  Deliberately left alone: `.chip` (four to five per card on the landingpage —
  twenty coloured labels on one screen is not a dose), `.chip-active` (already
  bordeaux), and the panel's `.tds-page__eyebrow` (carries the per-product
  accent, which is product signal rather than decoration).

  Guarded numerically in `design.test.ts`: the contrast of each role is
  computed from the real token chain, resolved through `--tds-eyebrow-color`
  rather than the hue name — moving a colour into a TEXT role is exactly where
  contrast quietly fails, and no screenshot shows it.
- **The decoration layer is one step more present.** It was dosed so quietly
  that shapes and conduits did not read at all: shape alpha 0.07 → 0.09 (dark
  0.06 → 0.075, phone 0.05 → 0.06), line opacity 0.16 → 0.20 (dark 0.20 →
  0.24), the `.tds-wash` fields 0.12/0.11/0.09 → 0.14/0.13/0.11, and the panel
  canvas fields 0.06/0.05 → 0.07/0.06. Only the literals moved —
  `--tds-decor-field-strength` stays 1 / 0.55, so the phone and dark-mode
  reductions keep their proportions and there is exactly one place that was
  turned up.
- **Checkboxes and radios take the brand accent** (`accent-color:
  var(--tds-panel-accent)`). They were the last unbranded control in the
  system: every settings form in the panel — dozens across thirteen extensions
  — drew the operating system's blue tick next to carefully styled `.field`
  inputs. `accent-color` rather than `appearance: none` on purpose:
  re-implementing the control means re-implementing its indeterminate state,
  focus ring, disabled rendering and high-contrast behaviour in a library
  thirteen repos consume blind. This tints the native control and changes
  nothing else — no layout risk, no size change, no markup at any call site.
  Visible when a box is *checked*; an unchecked box is unchanged.

### Added
- **`--tds-right-lane` — the bottom-RIGHT corner's occupancy, published by
  `LiveChatCta`.** The widget measures its closed launcher and publishes the
  height on `document.documentElement`, so a host page's own fixed chrome can
  stack above it. Same mechanism as the cookie notice's `--tds-bottom-lane`,
  and the same discipline: cleared on unmount, on hide and on open, because a
  stale lane pushes a host's chrome up the page forever with nothing pointing
  back here.

  It exists because the landingpage's "book a call" control is fixed in exactly
  that corner at `z-index: 35`, twelve layers under the launcher — with the
  widget enabled for that frontend it covered the control completely. Not
  visible today only because the widget renders nothing until an admin turns it
  on per frontend.

  Published only while the launcher is CLOSED. An open panel is up to 34rem
  tall and already owns the corner; lifting a host's CTA above that would park
  it mid-screen. Open, the panel simply covers it — that is a panel the user
  deliberately opened, not a competing call to action.

### Fixed
- **`.live-chat-cta` now reads `--tds-bottom-lane`.** The cookie notice spans
  the FULL width on a phone (`inset-inline: 1rem`), so it occupies the
  launcher's corner as much as the toast stack's. The toast stack has read the
  lane since it existed; the launcher never did and sat on top of the notice at
  every narrow width.

### Added
- **The "Digitale Maßarbeit" decoration layer** (`styles/primitives.css`), the
  shared vocabulary that replaces per-app aurora gradients and blurred glows:
  - `.tds-wash` (+ `--calm` / `--mirror`) — soft brand fields at a section's
    OUTER edges, painted into a `z-index:-1` pseudo-element under an
    `isolation: isolate`.
  - `.tds-decor` — the click-through, clipping canvas a section's shapes live
    in, so a shape can be authored oversized and cut by the viewport edge
    without ever producing horizontal overflow. Its following siblings are
    lifted to `z-index: 1` automatically.
  - `.tds-shape` — constructed geometry: `--capsule`, `--half`,
    `--quarter-{tl,tr,br,bl}`, `--rect`, `--diagonal`, `--outline`, tinted
    `--navy` / `--bordeaux` / `--coral` / `--gold`. **The quarter suffix names
    the ROUNDED corner**; picking the wrong one renders a plain rectangle, and
    that is only visible in a browser.
  - `.tds-circuit` (+ `--draw`) — the fine conduit lines with rounded 90°
    corners and nodes. Wraps a decorative `<svg aria-hidden="true">` whose
    animated elements carry `pathLength="1"` and `data-circuit-line` /
    `data-circuit-node`. One-shot build-up, gated on `no-preference`, upgraded
    to a `view()` timeline where the browser has one.
  - `.tds-brandbar` (+ `--sm`, `--on-dark`) — the three-part bordeaux · coral ·
    gold accent at 42 : 20 : 12 with a 6px gap, as ONE element with three
    background layers.
  - `.tds-tone-{paper,sand,white,navy,ink}` — the four grounds a page
    alternates between. The two dark tones re-map the page tokens
    (ink/muted/line/card) the way `.portal-sidebar` does, so a shared
    primitive rendered inside them reads correctly with no call-site override.
- **Decoration tokens** in `base.css`: `--tds-decor-{navy,bordeaux,coral,gold}`
  (rgb triplets, so a low alpha is an honest alpha rather than a `color-mix`
  toward transparent black), `--tds-decor-field-strength` (one dial, turned
  down on phones and in dark mode), `--tds-decor-line-opacity`,
  `--tds-decor-shape-alpha`, the `--tds-brandbar-*` proportions and
  `--tds-dur-draw`. All have dark twins.
- **Brand palette aliases** `--color-cranberry` and `--color-gold`. Decoration
  had to reach for `--color-cat-rose` (a wayfinding hue) and `--color-warning`
  (an operational state) to get those two colours, which both misreads at the
  call site and pins decoration to tokens whose job is to change when the
  status palette is retuned.

### Changed
- **`--color-line` warmed one step, `#e8e6df` → `#e3e0d8`.** The hairline is the
  most repeated surface in the library, so a border that reads grey is what
  kept a warm-white page feeling like a cold SaaS sheet. Contrast is unchanged
  for practical purposes (a 1px rule is a graphic, ~1.10:1 either way).
- **The marketing surface dropped from `--tds-shadow-lg` to `--tds-shadow-sm`.**
  A 32px-blur drop shadow on every card is grey haze on a warm paper ground,
  and when everything is lifted nothing is. Separation comes from the hairline,
  the sand/white tone change and the spacing. It is still the only surface with
  any resting elevation.
- **The panel canvas is warm.** `--tds-panel-canvas` tints 3% of the accent
  (was 4%) into a 40 % sand / 60 % paper blend instead of bare paper: at 4%
  over plain paper the accent's blue pulled the canvas slightly COOL, which is
  the one direction a surface someone stares at for hours must not go.
  `[data-surface="panel"] .panel-main` also gained two very soft brand fields
  at its outer edges, at roughly half the alpha of the marketing `.tds-wash`.
- **The panel's page-head accent is the three-part bar**, with
  `--tds-panel-accent` as its first and longest segment — so the management
  frontend's rule still reads red and the portal's still reads navy while both
  pick up the brand's coral/gold rhythm. Proportions come from the shared
  `--tds-brandbar-*` tokens, so this and `.tds-brandbar` cannot drift.
- **`.brand-header` is paper, not glass.** Fill 85% → 92%, and the 2px
  navy-tinted bottom rule is a warm hairline: "keine starke Glasoptik, keine
  ausgeprägten Schatten". The brand colour enters the header through the active
  nav item and the wordmark, where it means something.

### Added (earlier, unreleased)
- **`MembershipSchema.permissionDenies` — rights withheld from one person even
  where a group grants them.** The resolution rule in `tds-auth-api` becomes
  `(direct ∪ groups) minus denies, then ∩ ceiling`. It exists because the
  alternative, once one member of a shared group must not have one of its
  rights, is to clone the group for that person — after which the clone stops
  tracking the original and nobody notices for months.

  It is **not** `permissionCeiling` under another name, and conflating the two
  is the easy mistake: the ceiling is the platform admin's limit on what a
  company admin may ever hand out; the denies are the ordinary decision about
  one person, which a company admin owns. A right can be inside the ceiling and
  denied; it cannot be outside the ceiling and granted. Unlike the ceiling there
  is no null/empty distinction — an empty deny list and no deny list say the
  same thing — so it defaults to `[]` rather than being nullish.

### Changed
- **A permission key is now validated by SHAPE, not by catalog membership.**
  `PermissionKeySchema` (`^[a-z0-9][a-z0-9-]{0,31}:[a-z0-9][a-z0-9-]{0,31}$`)
  replaces the `z.enum(PORTAL_PERMISSIONS)` that guarded the user-management
  payloads. `PORTAL_PERMISSIONS` was never the catalog the panel actually runs
  on — thirteen composed extensions each contribute their own keys — and
  `tds-auth-api` intersected every write **and every read** with those nine, so
  `companies:read` or `wiki:write` was accepted by the UI, written to the
  database, and silently dropped again on the way out. The authoritative
  catalog belongs to the service that enforces it (`GET /admin/permissions`);
  an unrecognised key grants nothing anywhere (`UserContext::has()` is an exact
  string match), so the failure mode moves from **silent data loss** to
  **inert data**. `PermissionSchema` stays as an alias of the new
  `PortalPermissionSchema` for code that genuinely means the seed set.

  A wildcard is deliberately NOT a valid key: `*` would grant every *future*
  extension's permission, which is exactly the escalation the per-company
  ceilings exist to prevent. `MAX_PERMISSION_KEYS` caps a grant at 128 — the
  resolved set rides in the JWT, which rides in a cookie.

- **`MembershipSchema` speaks `companyId`, carries groups, and knows about
  company admins.** New fields `groupIds`, `isCompanyAdmin`, `permissionCeiling`;
  `customerId` is accepted as a deprecated alias and normalised to `companyId`
  by the schema itself, so an older client keeps working for one release.

- **`PORTAL_ROLE_PRESETS` is `@deprecated`** — superseded by real, persisted
  groups in `tds-auth-api` (seeded from exactly these four, with matching
  slugs). They were only ever UI sugar: the editor expanded one into a flat
  array on click and nothing recorded which preset was used, so editing a
  "role" later changed nothing for anyone already carrying it.

### Added
- **`setRequestHeadersProvider` (`./api`) — the twin of
  `setUnauthorizedHandler`.** Headers to add to every `apiFetch`, registered by
  the frontend host's shell. Its first consumer is the company switcher, which
  has to put `X-Act-As-Company` on every extension call — and an extension
  cannot reach into the host to do it. Generic headers rather than
  `setActiveCompany(id)` on purpose: this is a design/i18n/transport library
  and must not learn what a company is.

  The provider receives the **resolved absolute URL**, because which headers
  are safe depends on the target: the auth API's CORS allow-list is narrower
  than the composed API's, and a header it does not allow fails the
  *preflight* — the request is then never sent and the control simply looks
  dead. Provider headers sit under the caller's, and a throwing provider is
  ignored rather than breaking the request.

- **`.tds-dropdown__caption`, and a selected row that answers to `aria-checked`.**
  The company switcher lives inside the profile menu, so the menu needed a
  section heading and a row that can read as *selected*. The caption carries no
  role and is never focusable — arrow-key roving must walk past a label, not
  stop on it. The selected style now matches `aria-current="true"` **and**
  `aria-checked="true"`, because the switcher's rows are `menuitemradio`:
  styling only the link spelling would have left the active company looking
  exactly like the inactive one.

- **`Avatar`, `.tds-avatar` and `.tds-dropdown*` — the profile menu's parts.**
  The frontend host had no desktop header at all, so nothing in the panel ever
  said who was logged in and `logout()` sat in `lib/auth.ts` imported by
  nothing. `Avatar` renders an image when there is one and a tinted circle of
  initials otherwise, picking its hue from the categorical palette through a
  stable hash of the user id — so one person keeps one colour across the menu,
  the profile page and a user list. A broken `src` falls back to initials
  rather than the browser's broken-image glyph: avatars point at a service
  that may not be deployed yet, and an empty grey box in the shell's
  top-right reads as a bug.

  `.tds-dropdown__item` is 44px at **every** pointer type, not just coarse —
  it is a menu row, and a mouse user with a tremor deserves the target a
  thumb gets. The panel is hidden with `display: none` (via `[hidden]`), never
  an opacity fade, so a closed menu cannot be tabbed into.

- **`.panel-topbar` (app.css) — the panel's first desktop header.** Sticky,
  right-aligned, separated by a hairline. Deliberately semi-opaque rather than
  a solid `--color-paper` band: `[data-surface="panel"] .panel-main` paints a
  radial glow anchored top-**right**, exactly where this bar sits, and an
  opaque fill would slice the top off it. Panel-only-by-name chrome like
  `.portal-sidebar`, so it carries no `[data-surface]` scope; the tools site
  imports app.css and simply never renders it.

- **`./theme` — the theme runtime, and a third preference: `system`.** The
  theme was a per-BROWSER localStorage value with no way to say "follow the
  OS" and no way for anything to observe a change. `applyThemePreference` is
  now the single write path (`ThemeToggle` and the host's profile page both
  go through it) and announces itself on `tds:theme-change`, which is what
  lets the frontend host persist the choice per **user** without this library
  learning that a server exists — the same window-`CustomEvent` bus, for the
  same reason, as the toast host.

  `"system"` is deliberately **not a stored value**: it is the absence of one.
  The no-flash bootstrap already falls through to `prefers-color-scheme` when
  the key is missing, so "follow the OS" needs no bootstrap change and cannot
  drift from it. `startSystemThemeSync()` keeps that honest while the page is
  open — without it, "System" only ever meant "whatever the OS said at load",
  which reads as the setting being broken.

  Its own entry point rather than `./design`, which is documented as pure
  functions: same split as `./toast` and `./api`, so the host's plain-TS
  preferences sync can import it without pulling React into that chunk.

  > **Released as a PATCH, deliberately** — same reasoning as `./markdown`
  > below. Every item here is additive (two new exports, new CSS classes, no
  > existing export changed), and the host plus both products pin `^0.20.0`,
  > which for a `0.x` caret is minor-locked. A minor would force a repin in
  > three repos for a change nothing can break on.

- **`./markdown` — the escape-first `renderMarkdown`,** lifted out of
  `tds-ext-blog-cms-pkg/islands/BlogsList.tsx` together with its test suite. The
  customer wiki renders handbook articles with it and the blog-CMS editor renders
  its preview pane with it; an XSS boundary must not exist in two copies.
  Escape-first means every text run is HTML-escaped *before* any markdown
  transform, so raw HTML and `<script>` become inert text — that is what lets the
  panel skip `dompurify` entirely.

  > **Released as a PATCH, deliberately.** This is additive (a new subpath, no
  > existing export touched), and both products plus the host pin `^0.20.0`,
  > which for a `0.x` caret is minor-locked. A `0.21.0` would force repins in the
  > host, both products and every extension that later wants the renderer, for a
  > change nothing can break on. Same convention the extensions follow inside
  > their pinned minor (root `CLAUDE.md`).

## [0.20.1] — 2026-08-12

### Changed
- **The panel accent axis is reversed, and the colour now means _permissions_.**
  The customer portal renders the base panel in the brand navy — exactly what the
  admin frontend used to look like — and the **admin** frontend is the one that
  overrides, into the brand burgundy. `management.tracht-digital.de` is where a
  destructive action lands, so it is the surface that carries a standing marker.
  - New `--color-management` token: `#820933` light, `#e8536f` dark. It is its own
    token rather than `var(--color-accent)` because the accent's dark value is
    byte-identical to `--color-cat-rose`, and the panel accent doubles as the
    Verwaltung zone's `--nav-hue` — that would put two rail zones on one hex.
  - The `[data-frontend="customer"]` block is **gone**; the portal has no override.
  - **The base block must stay `--color-primary`.** `tds-tools-frontend` renders on
    this surface and writes no `data-frontend`, so it inherits the base accent — the
    management red there would paint the *public* tools site in the colour that
    claims administration rights. `design.test.ts` fails the build on it.
  - Consumers pair this with **`tds-core-frontend` 0.18.1**, which moves the `tools`
    nav group off `--color-cat-rose` (ΔE 12 from the new accent) to `--color-info`.

### Fixed
- The nav-rail contrast suite measured only the navy rail, so it structurally could
  not have seen a product's accent change. It now resolves and measures **both**
  products' rails in both themes, each with its own accent as a nav zone, and adds a
  CIELAB separation assertion — contrast answers "is this readable", not "are these
  two the same colour", and six zones can all clear AA while reading as one red.

## [0.20.0] — 2026-08-12 — **VOID, DO NOT USE**

Published in error from the commit *before* the change above, so it is byte-identical
to 0.19.0 in behaviour while carrying a higher version number. A release workflow was
dispatched against a stale `main` (a failed `git push` was masked by a shell pipe) and
had already published by the time it was cancelled.

`npm deprecate` **cannot** be used to mark it: the GitHub Packages npm registry does
not implement the deprecate endpoint (it answers `400 unmarshalling packument failed:
version.ID cannot be empty`), and deleting a version needs a `delete:packages` token
that no token here carries. Hence this entry — it is the only durable marker available.

Practical exposure is nil: `@latest` is 0.20.1 and every consumer pins `^0.20.0`,
which resolves 0.20.1. Do not pin 0.20.0 exactly.

## [0.18.0] — 2026-08-07

### Added
- **Mobile pass over the `panel` surface.** The shell had a drawer below `lg`
  from the start, so the phone layout *looked* handled — but across the whole
  composed panel (host + 13 extensions) Tailwind emitted exactly two
  content-level breakpoint utilities, and this library carried three
  width-based media queries in six stylesheets. Everything else rode on
  `flex-wrap` or on luck.
  - **`.tds-table` scrolls below 40rem** (`display: block; overflow-x: auto`).
    It had no mobile treatment at all, and `body { overflow-x: hidden }` CLIPS
    the resulting overflow instead of revealing it — so a wide table silently
    lost its right-hand columns with no scrollbar to hint at them. On the
    module page that was the *Aktion* column, i.e. the update button. The
    identical treatment has been on `.tds-prose table` for the blog since the
    library was split; the panel's own table primitive never got it.
  - **`button.chip` / `a.chip` get the 44px coarse-pointer target.** A chip is
    also this library's filter and tab control, and those were sitting at the
    status badge's ~22px. Plain `.chip` stays compact — it is read, not tapped.
  - `.tds-toggle-row` wraps, `.tds-thread__item` breaks a pasted URL
    (`overflow-wrap: anywhere` — the chat widget's own bubble always had this),
    and `.tds-modal` keeps a 1rem gutter instead of running to the display edge.
  - The live-chat panel measures in `dvh` rather than `vh` (on iOS `100vh` is
    the viewport with the URL bar retracted, so its composer was pushed off the
    screen), and its dismiss dot, close glyph and tab strip grow to 44px on a
    touch pointer.
  - `env(safe-area-inset-bottom)` on all three fixed bottom elements. Note the
    toast's `calc()` must name `--tds-bottom-lane` FIRST — `design.test.ts`
    matches `calc([^)]*--tds-bottom-lane`, and an `env()` ahead of it fails
    that assertion for a reason unrelated to the change.
  - `--tds-panel-title-size` is a `clamp()`. At a fixed 30px/700/-0.03em,
    "Nutzerverwaltung" was as wide as a 375px phone minus its padding.

  Found only by rendering the panel at 375px in a real browser — none of it
  throws, and none of it is visible in a diff:
  - **`.tds-page__head` stacks below 40rem.** `flex-wrap` did not save it: the
    toolbar wraps its own buttons before it moves to a new line, so it stayed
    beside the title and squeezed it to 113px — narrower than the word
    "Dashboard", which then overflowed its box and ran under the buttons.
  - **The small-caps `th` treatment is now on `thead th` only.** On every `th`
    it also hit `<th scope="row">`, so a module name and its package id
    rendered as 11px letterspaced uppercase muted text: six wrapped lines on a
    phone, and wrong on the desktop too. A row header labels its row.
  - A scrolled table's `<caption>` is `position: sticky; left: 0` — as a block
    child of a now-block table it had inherited the full scroll width, so half
    the sentence sat off-screen.
  - The last three sub-44px controls: `.tds-theme-toggle` (36px, and one of
    the three things the panel's mobile top bar shows), `.cookie-notice-btn`
    (38px), and a bare checkbox, which the browser draws at 13px. The checkbox
    stops at **24px** — the WCAG 2.5.8 (AA) minimum — because ours sit inside a
    `<label>`, so the effective target is the whole row.

### Fixed
- Changelog housekeeping: **0.17.0 shipped without an entry** (below), and the
  `[Unreleased]` compare link had pointed at `v0.5.2` for eleven releases.

## [0.17.0] — 2026-08-06

### Added
- `tags?: string[]` on the `BlogPost` type (`src/types/index.ts`), for the blog
  CMS. Types only — no CSS, no component, no runtime change.

> Note for consumers: a `0.x` caret is minor-locked, so `^0.16.0` never
> resolved this. The host and both products picked it up with the repin that
> came with the mobile pass above.

## [0.16.0] — 2026-08-05

> Shipped as a **minor** because it adds the `./toast` export subpath: a `0.x`
> caret is minor-locked, so consumers had to repin (host + products `^0.16.0`,
> extensions `>=0.16.0`) — `^0.15.0` would have kept resolving the toast-less
> build. Released together with core-frontend 0.14.0, all 14 extensions and both
> products.

### Added
- **Toast notifications — `ToastHost` + the `./toast` bus.** Transient outcome
  feedback in the four signal hues (`success` / `warning` / `danger` / `info`),
  raised from anywhere with `toast.success("Gespeichert.")`. The bus is a
  `window` CustomEvent (`tds:toast`), because Astro mounts up to 17 separate
  React roots per page and the loudest caller — the frontend host's
  `dashboardLayout.ts` — is not React at all; `src/toast/index.ts` therefore
  stays React-free so a plain-TS chunk can import it. `showToast` is SSR-safe
  and cannot throw into the caller it reports on, and buffers until the
  `client:idle` host has mounted.
  Two live regions render from first paint (assertive for failures, polite for
  everything else) because a region inserted *together with* its first message
  is never announced. Auto-dismiss is per variant (4 s success … 10 s danger),
  paused on hover/focus, capped at three per region, with repeats counted
  instead of stacked. Focus is never moved.
  The stack shares the bottom of the viewport with the cookie notice, so the
  notice now MEASURES itself and publishes `--tds-bottom-lane`; the toast adds
  it to its own `bottom`. A guessed offset was wrong on both sizes (the notice
  is 71px on a wide screen and 161px on a phone) and the stack rendered on top
  of it — caught in a browser, invisible to the unit tests.
  CSS is `.tds-toast*` in `base.css` (with the other floating shell components,
  so the public sites can adopt it with no CSS work); `app.css` offsets the
  bottom-left stack past the panel rail. `.tds-alert` remains the in-flow block
  message — see AGENTS.md for which to use when.

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

### Added — `.tds-menu-bar*` (hamburger toggle bars)
- Promoted from the landingpage header and the blog's journal header, which
  carried the same rules under two names (`.menu-bar*` / `.jnl-menu-bar*`), plus
  the new `--tds-radius-bar` token.
- The blog's copy described itself as a verbatim duplicate. It wasn't, and both
  differences mattered: the landingpage set `border-radius: 2px` while the blog
  omitted it — the flat surface talking, now a token override — and **only the
  blog had a `prefers-reduced-motion` rule**, so promoting the block fixed an
  accessibility gap on the landingpage instead of just deduplicating.
- The open state keys on `[aria-expanded="true"]` on any ancestor rather than a
  toggle class, so each header keeps its own button naming with nothing to
  coordinate. Verified in both builds: identical shared rule, `--tds-radius-bar`
  resolving to 2px on marketing and 0 on blog — so both render exactly as before.

### Added — `themeBootstrapScript` + the theme contract constants
- **`themeBootstrapScript`** (`tds-shared/astro`) — the no-flash theme
  bootstrap as a raw JS source string, replacing three hand-maintained inline
  copies in the landingpage, blog and frontend-host layouts. The logic was
  identical in all three; the text was not (the host had dropped the
  `catch` comment and rewrapped a line), which is exactly how a
  behavioural difference would have crept in unnoticed.
- **`THEME_STORAGE_KEY` / `THEME_ATTRIBUTE` / `THEMES`** (`tds-shared/design`) —
  the contract between the bootstrap (reads the key before paint),
  `ThemeToggle` (writes it) and `base.css` (selects on the attribute). All
  three previously hardcoded `"tds-theme"` / `"data-theme"` independently, so
  a rename in one would have silently split the toggle from the bootstrap:
  the theme still persists, but every reload flashes the OS default for a
  frame. `ThemeToggle` now imports both.
- **Call it with `set:html`, not as a template body.** A template body would
  leak literal braces into `dist/` (the raw-body trap in the root CLAUDE.md).
  Verified in all four built sites that the emitted script is unescaped — the
  `"tds-theme"` quotes stay `"` and `&&` does not become `&amp;&amp;` — and is
  byte-identical to the script the landingpage shipped before.
- Tested by **executing** the script against hand-rolled globals rather than
  only asserting on its text: stored-wins-over-OS, corrupt stored value,
  `localStorage` throwing (Safari private mode), and missing `matchMedia`.

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
- **Three** known duplicates remain unpromoted. Each is blocked on something
  other than the CSS move, so none is a "just do it later" item:
  - the **reading-progress bar** — two mechanisms (a framer-motion island vs a
    vanilla script) *and* two looks (2px gradient vs 3px solid). Unifying the
    look is the visual redesign this change explicitly rules out.
  - the **`[data-reveal]` scroll-reveal primitive** — the blog uses CSS +
    IntersectionObserver, the landingpage uses framer-motion. Promoting means
    moving the landingpage off `motion` for reveals: a behavioural change with
    its own risk, not a shared-CSS problem.
  - the **`.brand-logo` CSS-mask logomark** — better than the landingpage's
    `filter: brightness(0) invert(1)` raster hack, but needs a single-colour
    silhouette asset the landingpage does not ship. Blocked on an asset.

  See the note at the bottom of `styles/primitives.css`. (The hamburger bars
  and the theme bootstrap, previously listed here, are now promoted — see
  above. `<BrandWordmark>` was deliberately resolved as a *host-local*
  component rather than a shared one; the rationale is in AGENTS.md.)
- **`src/__tests__/design.test.ts`** — 54 tests guarding the contracts that
  fail silently: surface tokens present, geometry kept out of `@theme inline`,
  surface layers attribute-scoped and token-only, no `999px` literal left in
  primitives, `.btn` vs `.btn-*` split intact, `backdrop-filter` unprefixed,
  no `border-radius` under `:focus-visible`, the `.tds-modal` top-layer rules,
  the `.tds-menu-bar` open state, and the chip catalog matching the `.chip--*`
  rules that actually exist. 180 tests across the whole suite.

- **Display font is now Lato, not Hanken Grotesk.** `--font-display` moves to
  **Lato** — the official Tracht Digital Solutions brand font — so the whole
  brand (display headings + `.brand-wordmark`) reads in Lato. Body/mono are now
  **Plus Jakarta Sans / JetBrains Mono everywhere** — this entry originally said
  body/mono were "unchanged (Geist on the landingpage)", which the same
  unreleased change then contradicted by moving the landingpage off Geist (where
  `--font-mono` had been pointing at an uninstalled `Geist Mono`).
  Lato ships as the static `@fontsource/lato` package (weights 400/700/900),
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

[Unreleased]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.18.0...HEAD
[0.18.0]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/Tracht-Digital-Solutions/tds-shared-pkg/compare/v0.15.1...v0.16.0
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

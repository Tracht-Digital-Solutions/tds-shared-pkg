# Components and primitives

## Promotion rules

- **Don't promote a component or util until two consumers need it.** Duplication is cheaper than the wrong abstraction.
- **Diff the duplicates line by line first**; the differences are usually the surface speaking (e.g. `--tds-radius-bar`)
  or an accessibility gap one copy had fixed.
- **A shared rule must not name a per-app class**; scope by the shared class (`.tds-menu-bar` keys on
  `[aria-expanded="true"]` on any ancestor).
- **A shared snippet is fine where a component would only forward `class`** (`.brand-wordmark`). Promote behaviour, not
  markup wrappers.
- **New primitives are `tds-`-prefixed.** Long-standing names (`.btn`, `.chip`, `.field`, `.status-pill`,
  `.brand-header`) keep theirs.
- **Audit new classes for both shapes** (BEM and plain words like `.error`, `.muted`, `.btn-secondary`).

## Controls

- **`.btn` carries the geometry, `.btn-*` only the colour; both are required.** Variants: primary, accent, ghost,
  danger.
- **`.field` is the input element**, not a wrapper.
- **`.tds-table` scrolls itself below 40rem** (`display: block; overflow-x: auto`); don't wrap it. A table without a
  focusable cell needs `tabindex="0"` + `role="region"` + a label at the call site.
- **The 44 px coarse-pointer floor** covers `.btn`, `.field`, `.field-boxed` and interactive chips (`button.chip`,
  `a.chip`), not badge `.chip`s.
- **Chip variants:** categorical ones are `--cat-` prefixed. A dynamic variant goes through `resolveChipVariant()`
  (`./design`), which maps aliases and falls back to `neutral`.
- **Layout primitives:** `.tds-stack` (+ `--tight` / `--loose`), `.tds-row` (+ `--between`), `.tds-compose`
  (+ `__actions`), `.tds-toolbar`, `.marginalia`. About 31 singular internals legitimately stay bespoke and unstyled.

## Feedback: three primitives, one event reported once

| Primitive | Job |
|---|---|
| `.status-pill` | Inline label, one word |
| `.tds-alert` / `<FormAlert>` | Block message **in the flow** |
| `ToastHost` | Transient overlay |

> Transient outcome ("Gespeichert.", "Fehler (HTTP 500).") → toast. Persistent state (load failure, validation summary,
> empty state) → in-flow alert. Anything to read or copy (temporary password, id, link) → always in-flow.

- Raise toasts with `toast.success` / `.warning` / `.danger` / `.info` from `./toast` (React-free) or `./components`.
  The vocabulary is `danger`, not `error` (`design.test.ts` pins it).
- **Mount `ToastHost` once per app**; a second renders nothing and warns.
- A toast may carry `href` for something elsewhere (`.tds-toast__link`), **same-document leading-slash paths only**.
- `.status-pill` is never a banner; use `.tds-alert` (with `--tds-alert-hue`) or `.form-alert`.

## API calls

**Never call the panel API with a relative path; use `apiFetch` from `./api`.** A relative `fetch` resolves against
the product host, whose SPA fallback answers 200 + HTML; `res.json()` throws and `.catch(() => setRows([]))` renders a
calm empty state. See [architecture.md](architecture.md#srcapi-transport-and-runtime-config).

## Bottom lanes

Fixed bottom chrome publishes its measured height; anything else pinned there adds it. Never hard-code an offset.

- **`--tds-bottom-lane`** (full width): published by `CookieNotice`, read by `.tds-toast-host` and `.live-chat-cta`.
- **`--tds-right-lane`** (bottom-right corner): published by `LiveChatCta` from its closed launcher, read by the landing
  page's floating control.
- **`--tds-tabbar-lane`**: published by the app shell's tab bar.
- **The publisher must clear its lane** on unmount and whenever it stops occupying the space; `design.test.ts` asserts
  `setProperty` and `removeProperty`.

## Dialogs and menus

- **Never `window.confirm()`; use `<ConfirmDialog>`** (native `<dialog>` with `showModal()`).
  - `.tds-modal` has **no `z-index` and no `position: fixed`** (top layer).
  - Focus is set imperatively after `showModal()` (React doesn't render `autoFocus`); `showModal` is feature-detected
    with an `open` fallback.
- **Mobile menus are `src/nav` + `.tds-mobile-menu`**; `mountMobileNav` is the one implementation for the public
  headers (each keeps its markup).
  - **The scroll lock is counted** (`lockBodyScroll()`); never write `body.style.overflow` directly.
  - **`.tds-menu-toggle` never replaces `.btn`** (`lint:primitives` copies accept only `btn` / `chip` /
    `tds-dropdown__(trigger|item)`). It carries geometry only.
  - The panel host is a documented non-consumer (its off-canvas drawer stays).
  - `--tds-dur-none` exists only for the `visibility` step.

## Shared site bar (journal, tools, shop): `.tds-sitebar*` + `propertyNav()`

- **The list is `propertyNav()`** (Journal · Tools · Shop · Tracht Digital); a header adds only its extras and marks
  itself current. The main site's label is `propertyLabel` ("Startseite" / "Home").
- **The width is the blog surface's `--tds-shell-max`**; put `.tds-sitebar` on the `.tds-shell` element.
- **Right-hand order is fixed:** `.tds-sitebar__desktop` (DE|EN, theme, contact CTA in `.tds-sitebar__wide`) →
  `.tds-sitebar__actions` (account, extras, menu), which never hides. The CTA (`propertyContact(lang)`) yields below
  80rem; hide it via its wrapper, never on the `.btn`.

## Language switch (`.tds-lang-toggle`)

A group of **links** (works without JS, crawlable). `aria-current="true"` on the active half carries the state; `.on` is
only paint. Wrap in `role="group"` with a bilingual `aria-label` ("Sprache / Language"). The active half is
`--color-surface-navy` (fixed dark). Geometry follows `--tds-radius-chip`. Consumers choose hrefs (blog: home pages;
tools: the equivalent page).

## `AccountMenu`: the session on a public site

The public twin of the panel's `UserMenu`; a public page is fully usable signed out.

- **Reads may follow `apiBase`; writes that set a cookie may not.** A proxied or relative auth base doesn't forward
  `Set-Cookie`, so a logout through it would answer 200 and end nothing. `accountEndpoints()` accepts a configured
  `authBase` **only when absolute**.
- **Logout is `DELETE`** (a POST answers a resolved 405).
- **Signing out reloads**; it doesn't redirect (and `ToolGate` may have revealed premium content).
- `loggedOut="nothing"` (blog) or `"login"` (tools); the sign-in link paints immediately.
- **`hasAccountHint()` gates the refresh** (key `tds_pub_account`), so anonymous readers don't pay `POST /refresh`.
- **The hint caches the name** (`tds_pub_account_label`) to avoid a sideways layout shift. Both keys clear together.
- No company switcher (`X-Act-As-Company` isn't in auth-api's `Allow-Headers`).
- Its six labels live in the component, not `i18n/translations.ts`.
- Public installer profiles need `GET /auth/me` allowed **and** `loginUrl` in their runtime keys (`installer.test.ts`).

## `PostCover` / `AbstractCover`

The six brand-geometry covers for posts without a picture, used by the blog and the landing page's journal row.

- **The variant is a hash of the slug**, so it can't be copied (two copies would draw two pictures of one article).
- **No `client:` directive** (static inline-styled markup); don't add hooks.
- **`--tds-flat-tint` exists only on the blog surface**; the component's literal `color-mix()` fallback keeps variant 4
  visible elsewhere (`PostCover.test.tsx`).
- **`hasPhotoCover()`** is the one rule for "is there a real picture"; resolving `/uploads/…` is the caller's job.

## Other shared islands

`ThemeToggle`, `Avatar` (`.tds-avatar` in `primitives.css`), `FormAlert`, `ConfirmDialog`, `CookieNotice`, `LiveChatCta`,
`ToastHost`, `Spinner`, `Skeleton`, `SkeletonText`. Their CSS lives in `base.css` so base-only consumers get it.

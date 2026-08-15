# @tracht-digital-solutions/tds-shared

> **Setting this up from scratch?** See [`INSTALL.md`](INSTALL.md) for
> the step-by-step bring-up (build → publish → grant repo access).
> This README documents the package contents + consumer patterns.

---


Shared design system (CSS foundation + React components), TypeScript
types, Zod schemas, i18n strings, and motion presets used across the TDS
frontends. Internal package — not published to the public npm registry;
lives on **GitHub Packages** under the `@tracht-digital-solutions` scope.

## Install

Each consumer repo (frontends and any tool that imports the package)
needs a **project-level `.npmrc`** that scopes
`@tracht-digital-solutions` to GitHub Packages and authenticates via
the `NPM_TOKEN` env var:

```ini
# .npmrc (committed to each consumer repo)
@tracht-digital-solutions:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

The `${NPM_TOKEN}` is a literal placeholder — npm expands it at
install time from the shell environment. **No token is committed.**
Setup differs between local dev and CI:

### Local dev

1. Generate a GitHub Personal Access Token (classic) at
   <https://github.com/settings/tokens> with the `read:packages`
   scope. If your tokens require SSO, click "Configure SSO" next to
   the token and authorize it for the `Tracht-Digital-Solutions` org.

2. Export the token as `NPM_TOKEN` whenever you `npm install` in a
   consumer repo. Two equivalent ways:

   ```bash
   # one-off
   NPM_TOKEN=ghp_xxxx npm install

   # persistent for the shell session
   export NPM_TOKEN=ghp_xxxx
   npm install
   ```

   On Windows PowerShell:
   ```powershell
   $env:NPM_TOKEN = "ghp_xxxx"
   npm install
   ```

3. Verify access works:

   ```bash
   curl -sI -H "Authorization: Bearer $NPM_TOKEN" \
     https://npm.pkg.github.com/@tracht-digital-solutions/tds-shared \
     | head -1
   # expect: HTTP/2 200
   ```

> **Don't** put the literal token directly into the project `.npmrc`
> — that file is committed and would leak the secret. Keep the
> placeholder; supply the value via env.
>
> A user-level `~/.npmrc` with the literal token is fine, but the
> project `.npmrc` overrides it when running from the project dir, so
> you still need to set `NPM_TOKEN` for the project file's
> `${NPM_TOKEN}` placeholder to expand. See **Troubleshooting**.

### CI (GitHub Actions)

`actions/setup-node` configures the registry and scope. For the
install token, use a **classic PAT stored as `secrets.NPM_TOKEN`** —
the auto-provided `secrets.GITHUB_TOKEN` only authorizes packages
owned by the same repo as the running workflow, so it 403s when a
consumer repo (e.g. `tds-admin`) tries to read this package from
`tds-shared-pkg`'s namespace.

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    registry-url: 'https://npm.pkg.github.com'
    scope: '@tracht-digital-solutions'

- name: Install
  # See "Lockfile portability" below for why --no-package-lock
  run: npm install --no-package-lock
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

The PAT needs `read:packages` on the
`Tracht-Digital-Solutions` org (classic token, SSO-authorized).
Stored once per consumer repo as the `NPM_TOKEN` secret.

> **Why not `GITHUB_TOKEN` + "Manage Actions access"?** The package
> settings UI does let you grant cross-repo Actions read, but that
> path was unreliable in practice (still produced
> `403 read_package` for us on several consumers even with the
> right setup). A PAT bypasses the GitHub Packages
> repo-trust model entirely.

### Lockfile portability

If you generate `package-lock.json` on Windows, npm only registers
the win32 platform binaries under `node_modules/` for native deps
(rollup, lightningcss, esbuild, sharp, tailwindcss-oxide). Both
`npm ci` and `npm install` then honor that and skip the Linux
binaries on the runner — `astro check` / `vite build` then crash
with `Cannot find module @rollup/rollup-linux-x64-gnu`
(npm/cli#4828). `--no-package-lock` makes npm ignore the lockfile
and resolve from `package.json`, which picks the correct platform
binaries.

## Subpath imports

```ts
import type { BlogPost, Project, Invoice } from "@tracht-digital-solutions/tds-shared";
import { ContactSchema, BlogPostCreateSchema } from "@tracht-digital-solutions/tds-shared/schemas";
import { translations, type Language } from "@tracht-digital-solutions/tds-shared/i18n";
import { LanguageProvider, useLang } from "@tracht-digital-solutions/tds-shared/i18n/react";
import { ease } from "@tracht-digital-solutions/tds-shared/motion";
import { ThemeToggle, CookieNotice, LiveChatCta, ToastHost, Spinner, Skeleton, SkeletonText } from "@tracht-digital-solutions/tds-shared/components";
import { toast } from "@tracht-digital-solutions/tds-shared/toast";
import { apiFetch, apiUrl } from "@tracht-digital-solutions/tds-shared/api";
import { renderMarkdown } from "@tracht-digital-solutions/tds-shared/markdown";
import { tdsViteBuild, cssTarget } from "@tracht-digital-solutions/tds-shared/astro";
```

## Rendering markdown

`renderMarkdown` turns a markdown string into HTML that is safe to hand to
`dangerouslySetInnerHTML`. It is **escape-first**: every text run is HTML-escaped
before any markdown transform, so raw HTML and `<script>` in the source become
inert text. That is the entire security model — there is no sanitizer to
configure, which is why the panel carries no `dompurify` dependency.

It covers the common subset (fenced and inline code, headings, bold, italic,
links limited to `http`/`https`/`mailto`/relative, unordered lists, paragraphs)
and is used by the blog-CMS editor's preview pane and the customer wiki's
handbook articles. It is **not** the public blog's renderer — that content goes
through the full build-time pipeline.

## Calling the panel API

Every call from a frontend product (or a `tds-ext-*` island inside one) to the
composed backend goes through `apiFetch`:

```ts
import { apiFetch } from "@tracht-digital-solutions/tds-shared/api";

const res = await apiFetch("/contact/messages?status=new");
if (!res.ok) { /* handle it — apiFetch never throws and never redirects */ }
```

It sends the shared session cookie and resolves the path against the API base:
`<meta name="tds-api-base">` (written by the frontend host shell) → the build's
`PUBLIC_API_BASE` → `https://api.tracht-digital.de`.

**Never call it with a bare relative path.** The products are static sites on
their own hosts, so `fetch("/contact/messages")` targets
`management.tracht-digital.de` — and the static host answers unknown paths with
its SPA fallback, i.e. **200 + HTML**. `res.ok` is `true`, `res.json()` throws,
and the usual `.catch(() => setRows([]))` shows a permanent empty state with no
error anywhere. That is exactly how the contact inbox came to report "Keine
Anfragen." while the rows sat in the database.

`apiUrl()` passes already-absolute URLs through unchanged, so wrapping an
existing call site is safe either way.

## Toasts

Feedback for an action's outcome, in the four signal hues. Mount the host
**once** in the shell layout, then raise toasts from anywhere — including
code that is not React:

```astro
---
import { ToastHost } from "@tracht-digital-solutions/tds-shared/components";
---
<ToastHost client:idle lang="de" />
```

```ts
// In an island, or in a plain <script> module — same call either way.
import { toast } from "@tracht-digital-solutions/tds-shared/toast";

const res = await fetch(url, { method: "PUT", body });
if (res.ok) toast.success("Gespeichert.");
else toast.danger(`Speichern fehlgeschlagen (HTTP ${res.status}).`);
```

They travel as a `tds:toast` window event, so islands, plain modules and the
browser console all reach the same stack without a shared React tree. Toasts
auto-dismiss (4 s success … 10 s danger, paused while hovered) — so anything
the user must **read or copy** belongs in an in-flow `.tds-alert`, not here.

A toast about something that lives **elsewhere** can link to it:

```ts
toast.info("Neue Kontaktanfrage: Max Mustermann", {
  key: "contact-tickets:42",   // dedup — a repeat counts up instead of stacking
  href: "/kontakt?id=42",      // same-document paths only
});
```

## Design system (CSS, in each frontend)

**One library, three surfaces.** The CSS ships as layers, not as one blob. An
app imports `base` + `primitives`, then whichever of `prose`/`app` it needs,
then **exactly one** surface layer — and sets the matching `data-surface` on
`<html>`.

| Layer | Holds | Imported by |
|---|---|---|
| `styles/base.css` | tokens (`@theme inline` colours/fonts + a plain `:root` geometry scale), dark theme, resets, type primitives, the floating shell components (`.cookie-notice`, `.live-chat-cta`, `.tds-toast*`) | every app |
| `styles/primitives.css` | cross-surface components — `.btn*`, `.chip*`, `.field`, `.tds-card`, `.tds-page`, `.tds-widget`, `.tds-list`, `.tds-table`, `.tds-alert`, `.tds-modal`, `.tds-thread`, … **plus the decoration layer** (`.tds-wash`, `.tds-decor`, `.tds-shape*`, `.tds-circuit`, `.tds-brandbar`, `.tds-tone-*`) | every app |
| `styles/prose.css` | `.tds-prose` long-form typography | blog + blog-CMS |
| `styles/app.css` | dashboard chrome (`.portal-sidebar`, `.nav-item*`, `.nav-drawer*`, `.stat-tile*`, `.dashboard-grid`); it `@import`s primitives.css | panel + blog |
| `styles/surfaces/{marketing,blog,panel}.css` | **custom properties only** — geometry, elevation, motion, display voice | exactly one per app |

```css
/* src/styles/global.css */
@import "tailwindcss/index.css";   /* NOT the bare "tailwindcss" — see below */

@import "@tracht-digital-solutions/tds-shared/styles/base.css";
@import "@tracht-digital-solutions/tds-shared/styles/primitives.css";
@import "@tracht-digital-solutions/tds-shared/styles/surfaces/marketing.css";

/* Tailwind ignores node_modules, and the shared islands (ThemeToggle,
   CookieNotice, Spinner, ConfirmDialog, ToastHost) are built out of utility
   classes — without this they render unstyled, with no error and no warning.
   MUST come after the @imports; @source before an @import is a build error. */
@source "../../node_modules/@tracht-digital-solutions/tds-shared";
```

Three things that are load-bearing and easy to get wrong:

- **`tailwindcss/index.css`, not `tailwindcss`.** Under Vite 8 the built-in
  postcss-import step resolves the specifier before `@tailwindcss/postcss` can
  expand it, and a bare package name is not a file — the build dies with
  `[postcss] ENOENT: … open '<root>/tailwindcss'`.
- **Font faces are JS imports in `Layout.astro`, never CSS `@import`s here.**
  `@tailwindcss/postcss` inlines a CSS `@import` without rebasing the package's
  relative `url(./files/*.woff2)`, so Vite emits no font files at all and every
  font 404s.
- **Set `data-surface` on `<html>`** or the surface layer never applies and
  every component falls back to the base geometry.

Canonical type stack: **Lato** (display) / **Plus Jakarta Sans** (body) /
**JetBrains Mono** (mono).

`base.css` declares three colour-token families — brand
(`--color-primary`/`-accent`/surfaces/neutrals), semantic status
(`--color-success`/`-warning`/`-danger`/`-info`) and categorical wayfinding
(`--color-cat-*`) — each with light + navy-tinted dark values. Use those rather
than re-declaring status colours in a frontend.

**Backgrounds and decoration are handled here too ("Digitale Maßarbeit").**
Do not invent a page background in a frontend. The vocabulary is:

| Class | Use |
|---|---|
| `.tds-tone-{paper,sand,white,navy,ink}` | the ground a section sits on; the two dark tones re-map ink/muted/line/card for their children |
| `.tds-wash` (`--calm`, `--mirror`) | soft brand fields at a section's **outer** edges — put it on the section, never on `body` |
| `.tds-decor` | the click-through, clipping canvas the shapes live in; its following siblings are lifted above it automatically |
| `.tds-shape` + `--capsule` / `--half` / `--quarter-{tl,tr,br,bl}` / `--rect` / `--diagonal` / `--outline` + `--navy` / `--bordeaux` / `--coral` / `--gold` | constructed geometry; position and size are the call site's, form and tint are the library's |
| `.tds-circuit` (`--draw`) | the conduit lines; wraps a decorative `<svg aria-hidden="true">` whose animated parts carry `pathLength="1"` + `data-circuit-line` / `data-circuit-node` |
| `.tds-brandbar` (`--sm`, `--on-dark`) | the three-part bordeaux · coral · gold accent — punctuation, not wallpaper |

Intensity is one dial: `--tds-decor-field-strength`, turned down on phones and
in dark mode. Scale an individual shape with `--tds-decor-shape-alpha` /
`--tds-decor-line-opacity` at the call site rather than writing a raw `rgba()`.

**Mobile is handled here, not per page** (0.18.0). `.tds-table` turns itself
into a horizontal scroller below 40rem, `.tds-page__head` stacks, interactive
chips take the 44px touch target, and the fixed bottom elements clear the home
indicator. Consumers should not wrap a table in their own `overflow-x` or
hand-author a breakpoint for these — see AGENTS.md for the three layout rules.

## Astro build preset (`./astro`)

Every frontend must pin the same lightningcss prefixing floor, or the
frosted `.brand-header` `backdrop-filter` blur silently dies in Safari
≤17 (lightningcss only emits `-webkit-backdrop-filter` when it sees a
Safari `cssTarget`, and it reads that target from `vite.build.cssTarget`,
not `css.lightningcss.targets`). Import the preset instead of
hand-copying the target array — then a new frontend can't forget it and
the browser floor moves in one place:

```js
// astro.config.mjs
import { tdsViteBuild } from "@tracht-digital-solutions/tds-shared/astro";

export default defineConfig({
  vite: { build: { ...tdsViteBuild } },
});
```

`tdsViteBuild` is `{ cssMinify: "lightningcss", cssTarget }`; import the
bare `cssTarget` array if you need to merge it into an existing
`vite.build`.

## Develop (this repo)

```bash
npm install
npm run build           # one-shot build to dist/
npm run dev             # tsup --watch
npm run type-check      # tsc --noEmit
```

## Release

Two workflows publish to GitHub Packages (no local `npm version` needed for a
real release — the Release workflow bumps the version itself):

- **Push to `main`** → auto-publishes a `@dev` prerelease (`<v>-dev.<run>`).
- **Run the "Release (manual → GitHub Packages @latest)" workflow** (Actions →
  Run workflow) → bumps + tags + publishes the real version to `@latest`.

Land your change on `main` with a `CHANGELOG.md` entry, then press the Release
button. Consumers on a `^x.y.z` range pick it up on their next install/build.

## Troubleshooting

### `npm error 401 Unauthorized` on install in a consumer repo

The most common cause is `NPM_TOKEN` not being set in the shell
when running `npm install` from the project directory.
The project `.npmrc` ships with `_authToken=${NPM_TOKEN}` — if
that env var is empty, npm sends the literal string `${NPM_TOKEN}`
as the auth header and GitHub returns 401.

Order of resolution:

1. Confirm the env var is set in the shell that runs `npm`:
   `echo $NPM_TOKEN` (bash) / `echo $env:NPM_TOKEN` (PowerShell).
2. Confirm the token itself works:
   `curl -sI -H "Authorization: Bearer $NPM_TOKEN" https://npm.pkg.github.com/@tracht-digital-solutions/tds-shared | head -1`
   should return `HTTP/2 200`. If 401, the token is invalid /
   missing `read:packages` / not SSO-authorized for the org.
3. Confirm npm is reading the right `.npmrc`:
   `npm config get registry` should show `https://npm.pkg.github.com`
   for queries to the `@tracht-digital-solutions` scope. Run
   `npm config ls -l | grep -i tracht` to see which file contributes
   the registry mapping.
4. The project `.npmrc` overrides the user `~/.npmrc` for any key
   it sets. A literal token in `~/.npmrc` will be ignored when the
   project file specifies `_authToken=${NPM_TOKEN}` — that's the
   intended behavior, but it surprises people who expect a
   user-level token to "just work" from any directory.

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
import { ThemeToggle, CookieNotice, LiveChatCta, Spinner, Skeleton, SkeletonText } from "@tracht-digital-solutions/tds-shared/components";
import { tdsViteBuild, cssTarget } from "@tracht-digital-solutions/tds-shared/astro";
```

## Design system (CSS, in each frontend)

The brand design system ships as two stylesheets. Tailwind v4 processes
the `@theme` tokens they declare, so just `@import` them after Tailwind
and the font faces — there is no Tailwind preset or `tailwind.config`.

```css
/* src/styles/global.css */
@import "tailwindcss";

@import "@fontsource/lato/400.css";
@import "@fontsource/lato/700.css";
@import "@fontsource/lato/900.css";
@import "@fontsource-variable/geist/index.css";

/* Tokens, dark theme, base resets, scrollbar, focus, theme-switch,
   editorial type primitives — imported by every frontend. */
@import "@tracht-digital-solutions/tds-shared/styles/base.css";

/* Shared application chrome (chips, buttons, fields, header shell,
   hairlines, drop-cap, link/row interactions). Dashboard/content apps
   only — the marketing site omits this and keeps bespoke section CSS. */
@import "@tracht-digital-solutions/tds-shared/styles/app.css";
```

Lato is the single canonical display font (headings + brand
wordmark); Geist is the body font. Add app-specific CSS below the imports.

`base.css` declares three colour-token families — brand
(`--color-primary`/`-accent`/surfaces/neutrals), semantic status
(`--color-success`/`-warning`/`-danger`/`-info`) and categorical wayfinding
(`--color-cat-*`) — each with light + navy-tinted dark values. `app.css`
carries the dashboard surface classes that consume them: `.chip--*`,
`.status-pill*`, `.stat-tile*`, `.section-accent` and `.nav-item*`. Use these
rather than re-declaring status colours in a frontend (the admin + customer
frontends did, until 0.5.x).

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

# @tracht-digital-solutions/tds-shared

Shared TypeScript types, Zod schemas, i18n strings, brand tokens, and
motion presets used across the TDS frontends. Internal package — not
published to the public npm registry; lives on **GitHub Packages**
under the `@tracht-digital-solutions` scope.

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

2. Export the token as `NPM_TOKEN` whenever you `npm install` /
   `npm ci` in a consumer repo. Two equivalent ways:

   ```bash
   # one-off
   NPM_TOKEN=ghp_xxxx npm ci

   # persistent for the shell session
   export NPM_TOKEN=ghp_xxxx
   npm ci
   ```

   On Windows PowerShell:
   ```powershell
   $env:NPM_TOKEN = "ghp_xxxx"
   npm ci
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

`actions/setup-node` configures the registry and scope automatically.
`secrets.GITHUB_TOKEN` is populated for every workflow run with
read access to the repo's org packages — pass it through as
`NPM_TOKEN`:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    registry-url: 'https://npm.pkg.github.com'
    scope: '@tracht-digital-solutions'

- name: Install
  run: npm ci
  env:
    NPM_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

No additional secret needs to be created — the built-in
`GITHUB_TOKEN` has `read:packages` for the org's own packages on
push events.

If a workflow runs from a fork or otherwise lacks access to the
org's packages, create a fine-grained PAT with `read:packages`,
store it as a repo secret (e.g. `TDS_NPM_TOKEN`), and reference
that instead of `secrets.GITHUB_TOKEN`.

## Subpath imports

```ts
import type { BlogPost, Project, Invoice } from "@tracht-digital-solutions/tds-shared";
import { ContactSchema, BlogPostCreateSchema } from "@tracht-digital-solutions/tds-shared/schemas";
import { translations, type Language } from "@tracht-digital-solutions/tds-shared/i18n";
import { LanguageProvider, useLang } from "@tracht-digital-solutions/tds-shared/i18n/react";
import { ease } from "@tracht-digital-solutions/tds-shared/motion";
import { brandTokens } from "@tracht-digital-solutions/tds-shared/brand";
import tailwindPreset from "@tracht-digital-solutions/tds-shared/brand/tailwind-preset";
```

## Tailwind setup (in each frontend)

```ts
// tailwind.config.ts
import preset from "@tracht-digital-solutions/tds-shared/brand/tailwind-preset";

export default {
  presets: [preset],
  content: ["./src/**/*.{astro,ts,tsx}"],
};
```

## Develop (this repo)

```bash
npm install
npm run build           # one-shot build to dist/
npm run dev             # tsup --watch
npm run type-check      # tsc --noEmit
```

## Release

```bash
npm version patch       # or minor / major — creates the tag
git push --follow-tags  # CI publishes to GitHub Packages
```

## Troubleshooting

### `npm error 401 Unauthorized` on install in a consumer repo

The most common cause is `NPM_TOKEN` not being set in the shell
when running `npm install` / `npm ci` from the project directory.
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

# Installation — tds-shared

> Part of the Tracht Digital Solutions multi-repo project.
> This is the **shared library** — the design system (CSS foundation +
> React components), types, zod schemas, i18n translations, motion
> easing — published to GitHub Packages and consumed by every frontend.
>
> **You install this once, then never think about it again.** Every other
> frontend repo's `package.json` references `@tracht-digital-solutions/tds-shared`
> from the GitHub Packages registry.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 20 LTS or 22 LTS | Build target |
| npm | 10+ | Bundled with Node 20 |
| Git | any | Repo hosting |
| GitHub PAT (classic) | with `write:packages` | Manual publish (this repo's `publish.yml` uses `GITHUB_TOKEN`) |

## 1. Clone + install

```bash
git clone https://github.com/Tracht-Digital-Solutions/tds-shared.git
cd tds-shared
npm install
```

## 2. Build + test

```bash
npm run build       # emits dist/ (esm + cjs + .d.ts)
npm test            # vitest
npm run lint        # eslint
```

## 3. Develop locally against a consumer

While iterating on `tds-shared` itself, you usually want a consumer
(e.g. `tds-landingpage`) to see your in-flight changes without
publishing:

```bash
# in tds-shared/
npm run build
npm link

# in the consumer (e.g. tds-landingpage/)
npm link @tracht-digital-solutions/tds-shared
```

Undo by running `npm unlink @tracht-digital-solutions/tds-shared` in
the consumer and re-running `npm install` to pull the published
version back.

## 4. Release

The repo ships `.github/workflows/publish.yml` which builds and
publishes to GitHub Packages on every push of a `v*` tag:

```bash
# Bump version + tag in one step
npm version patch   # or minor / major
git push origin main --follow-tags
```

The workflow runs `npm publish` with `GITHUB_TOKEN`, so no PAT
management is needed. The package surfaces at
<https://github.com/orgs/Tracht-Digital-Solutions/packages> after
the workflow completes.

For a manual publish (rare — usually only during the first ever
release):

```bash
npm version patch
npm run build
npm publish --registry=https://npm.pkg.github.com
git push --follow-tags
```

You'll need a classic PAT with `write:packages` scope in
`~/.npmrc`.

## 5. Give consumer workflows an install token

Consumer repos (tds-admin, tds-blog, tds-customer, tds-landingpage)
need a `read:packages` token to install this package in CI. The
auto-provided `secrets.GITHUB_TOKEN` does **not** work cross-repo
— it only authorizes the workflow against packages owned by the
running repo, so a `tds-admin` workflow asking GitHub Packages for
`@tracht-digital-solutions/tds-shared` (owned by `tds-shared`) gets
`403 read_package` even with `packages: read` set.

The convention we settled on:

1. Mint a **classic** PAT with `read:packages` on the
   `Tracht-Digital-Solutions` org. SSO-authorize it for the org if
   your account requires it.
2. Add it as a repo secret named **`NPM_TOKEN`** in each consumer
   repo (`tds-admin`, `tds-blog`, `tds-customer`,
   `tds-landingpage`). Same value in each.
3. Consumer workflows reference it: `NPM_TOKEN: ${{ secrets.NPM_TOKEN }}`.

> The GitHub UI's "Package settings → Manage Actions access → Add
> repository" path is an alternative for keeping consumers on
> `GITHUB_TOKEN`, but in our setup it produced inconsistent 403s
> even when configured correctly. The PAT bypasses that model
> entirely.

(Alternative: flip the package visibility to **Public** under
**Danger Zone** so any repo can read it. Choose this if the package
contents don't need to stay private.)

## 6. Verify

```bash
# In a consumer repo:
NPM_TOKEN=ghp_xxxx npm install
# Should succeed without 401 or 403.

# Smoke-test the published exports:
node -e "console.log(Object.keys(require('@tracht-digital-solutions/tds-shared')))"
```

## Related repos

This package is consumed by:

- [tds-landingpage](https://github.com/Tracht-Digital-Solutions/tds-landingpage) — design system (base.css), components, i18n strings, motion
- [tds-blog](https://github.com/Tracht-Digital-Solutions/tds-blog) — design system (base + app.css), components, i18n strings, `BlogPost` type
- [tds-admin](https://github.com/Tracht-Digital-Solutions/tds-admin) — design system (base + app.css), components, types, zod schemas
- [tds-customer](https://github.com/Tracht-Digital-Solutions/tds-customer) — design system (base + app.css), components, types, zod schemas

## Troubleshooting

**`npm install` returns `401 Unauthorized` when consuming this package.**
You need `NPM_TOKEN` set in the env (CI) or a classic PAT with
`read:packages` in `~/.npmrc` (locally). See section 5 + README.

**Consuming workflow returns `403 read_package`.**
The workflow is using `secrets.GITHUB_TOKEN`, which can't read
packages owned by a different repo. Swap to a PAT via `secrets.NPM_TOKEN`
per section 5.

**`npm publish` says "402 Payment Required" or "scope not found".**
The `.npmrc` is targeting the public npm registry. Make sure
`@tracht-digital-solutions:registry=https://npm.pkg.github.com` is
set, and that your token has `write:packages`.

# @tracht-digital-solutions/tds-shared

Shared TypeScript types, Zod schemas, i18n strings, brand tokens, and
motion presets used across the TDS frontends. Internal package — not
published to the public npm registry.

## Install

```bash
npm install @tracht-digital-solutions/tds-shared
```

This package lives on **GitHub Packages**. Consumers need an `.npmrc`
that scopes `@tracht-digital-solutions` to GitHub:

```
@tracht-digital-solutions:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

`NPM_TOKEN` must be a GitHub PAT with `read:packages` scope. In CI,
set it as a repo or org secret.

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

## Develop

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

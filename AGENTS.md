# AGENTS.md — tds-shared-pkg

The shared library (`@tracht-digital-solutions/tds-shared`) consumed by **every** TDS frontend: the public
sites (landing page, blog, tools, shop, auth, cards), the panel host and both products, every extension and
tool pack, and the legacy portal. It owns the design tokens, surfaces and primitives, shared React islands,
i18n copy, schemas, the API transport, the public sites' page cache and setup wizard, and the release
scripts. PHP backends don't import it; they mirror the little validation they need.

## Commands

```bash
npm install --no-package-lock
npm run build        # tsup, dual ESM + CJS per entry point
npm run dev          # tsup --watch
npm run type-check
npm run test:run     # vitest; design.test.ts guards the CSS contracts
```

## Hard rules

- **Shared things change here and get a release**; never duplicate tokens, primitives or copy into a consumer.
- Don't promote anything until two consumers need it, and diff the duplicates line by line first.
- Surface layers declare only custom properties; apps never hand-author a radius.
- Every new colour token needs a light **and** a dark value.
- No runtime side effects in JS modules (`sideEffects: ["*.css"]`); no bundler-specific tricks.
- Never import `motion` statically from `./components`; never re-export `./cache` (Node builtins) from the root.
- Nothing ships hidden in SSR markup; nothing transitions `box-shadow`; durations and easings come from tokens.
- Never `outline: none` in a `:focus` rule, never `window.confirm()`, never a relative API `fetch`.
- One event, one feedback primitive (toast, in-flow alert or pill).
- New primitives are `tds-`-prefixed. No token name contains a digit.
- `version` is bumped by the release workflow; consumers pin minor-locked 0.x carets and must repin.

## Topic files

| File | Read before |
|---|---|
| [docs/agents/architecture.md](docs/agents/architecture.md) | Adding an entry point, changing the build, the API transport, data cache, release scripts or publishing |
| [docs/agents/design-system.md](docs/agents/design-system.md) | Changing tokens, surfaces, primitives, decoration, colour roles, shadows or the panel surface |
| [docs/agents/components.md](docs/agents/components.md) | Changing shared islands, feedback primitives, dialogs, menus, the site bar or the account menu |
| [docs/agents/theme-motion-app.md](docs/agents/theme-motion-app.md) | Touching the theme bootstrap, prefs, motion, reduced motion, the phone app shell or PWA |
| [docs/agents/page-cache-and-site.md](docs/agents/page-cache-and-site.md) | Touching `src/cache/` or `src/site/` |
| [docs/agents/installer.md](docs/agents/installer.md) | Touching `src/install/` or `tds-runtime.json` handling |
| [docs/agents/content-and-schemas.md](docs/agents/content-and-schemas.md) | Changing i18n copy, blog blocks or card blocks |
| [docs/agents/testing.md](docs/agents/testing.md) | Writing or changing tests |

Workspace rules: `../CLAUDE.md`. Cross-repo state: `../MIGRATION-STATUS.md`.

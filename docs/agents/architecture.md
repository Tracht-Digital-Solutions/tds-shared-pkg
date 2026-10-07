# Architecture

## Layout

```
styles/                    design-system CSS, shipped as-is (not built)
├── base.css               tokens (@theme inline + :root), dark theme, resets, focus, type, spinner/skeleton/toast CSS
├── primitives.css         cross-surface components
├── prose.css              .tds-prose long-form typography
├── app.css                panel/dashboard chrome (imports primitives)
├── app-shell.css          phone app shell (opt-in)
├── page-transitions.css   cross-document page fades
└── surfaces/{marketing,blog,panel}.css   geometry tokens only
src/
├── index.ts               barrel (types; browser-safe)
├── types/, schemas/       shared TS interfaces, Zod schemas (blogBlocks, cardBlocks, …)
├── i18n/                  DE/EN copy (translations.ts), React provider (react.tsx)
├── design/                pure design helpers (resolveChipVariant, THEME_* constants, …)
├── theme/                 theme runtime (applyThemePreference, system sync); React-free
├── prefs/                 visitor preferences cookie + account sync
├── motion/                presets; ./motion/react (islands), ./motion/dom (vanilla)
├── toast/                 toast bus (tds:toast window event); React-free
├── nav/                   mountMobileNav, counted lockBodyScroll, mountNavProgress; React-free
├── app/                   phone app shell (tab bar, sheets, tab pages, live filter)
├── pwa/                   service worker / manifest helpers
├── api/                   apiBase / apiUrl / apiFetch transport; React-free
├── data/                  client-only in-memory SWR cache (React)
├── markdown/              escape-first renderMarkdown (the panel's XSS boundary)
├── components/            shared React islands
├── consent/               consent store for cookie/ads notices
├── permissions/           permission catalog (PORTAL_PERMISSIONS)
├── connection/            site connection / pairing helpers (server)
├── astro/                 tdsViteBuild, cssTarget, themeBootstrapScript, motionSsrNoExternal
├── cache/                 SERVER-ONLY page cache (node:fs); own entry point
├── site/                  server helpers the public sites shared by copy
└── install/               host-side setup wizard (React island)
scripts/                   pack-release.mjs, app.cjs (release spine for SSR consumers)
```

Each directory with consumers is its own `exports` entry (`./api`, `./data`, `./cache`, `./site`, `./install`,
`./motion/react`, `./motion/dom`, `./styles/...`, …).

## Build rules

- **No runtime side effects in JS modules.** `sideEffects: ["*.css"]`; keep JS pure for tree-shaking.
- **No bundler-specific tricks.** tsup builds dual ESM + CJS.
- **`./cache` is never re-exported from `./index`.** It imports `node:fs` / `node:path` / `node:crypto`, and the root
  entry is in every browser bundle. `dist/index.js` is asserted to contain no `node:` import. Same for `./site`.
- **Never import `motion` statically from `./components`.** Astro hydrates the barrel as a whole namespace, so it
  would ship to every public page (+175 KB once). `ToastHost` and `FormAlert` reach their animated half via
  `import()`; a test enforces it.
- **The lightningcss `cssTarget` lives in `src/astro` only.** `.brand-header` authors `backdrop-filter` (and `mask`)
  unprefixed; lightningcss adds `-webkit-` only with a Safari target. Consumers spread `tdsViteBuild`.
- **Every SSR consumer spreads `motionSsrNoExternal`** into `vite.ssr.noExternal` (`./components` imports
  `motion`); otherwise `pack-release` fails.

## `src/api/`: transport and runtime config

`apiBase()` resolves: **`tds-runtime.json`** (written by the wizard) → `<meta name="tds-api-base">` →
`import.meta.env.PUBLIC_API_BASE` → `DEFAULT_API_BASE`. `apiFetch` awaits `runtimeConfig()` first, so call sites follow
a reconfigured host unchanged. `apiUrl()` leaves absolute URLs alone.

- **Mutable transport state lives on `globalThis` under a `Symbol.for` key.** tsup builds each entry independently,
  so `./components` and `./data` contain their own copy of `src/api`. Module-local handlers would lose the host's 401
  backstop and `X-Act-As-Company` provider (wrong company's data). Keep cached base, runtime config,
  `onUnauthorized` and `headersProvider` there; `api.test.ts` pins it.
- **A missing or broken runtime file is not an error** (404, SPA HTML, malformed JSON, offline, timeout → `null`).
- **The meta tag short-circuits the lookup** (panel products never request the file).
- **3 s deadline** on the runtime request.
- **`apiFetch` returns every HTTP status but a network failure rejects** (`TypeError`). Catch it at every call site:
  in-flow alert for loads, `toast.danger` for mutations.
- `apiBase()` memoises after its first DOM read; tests that swap the document call `resetApiBase()`.
- Tests that inspect `mock.calls[0]` call `primeRuntimeConfig(null)` in `beforeEach`.

## `src/data/`: the panel's in-memory SWR cache

Entry `./data` (imports React). **Per tab, memory only**; panel payloads hold invoices, tickets and messages, so no
`localStorage` or `sessionStorage`.

- The key is the request identity (absolute API path incl. query, GET only). Concurrent readers share a request; a
  fresh entry skips requests for 30 s.
- **Stale means old data stays on screen.** On expiry or `invalidate(prefix)` the previous value is kept while a new
  request runs; consumers pair `staleClass(stale)` with `aria-busy`. Deleting the entry is not invalidation.
- **Invalidation supersedes an in-flight answer**; `put()` follows the same rule.
- **A failed refresh keeps the previous value** and exposes the error (`useCachedJson` throws `ApiError`).
- This is not `./cache` (Node-only page HTML).
- `.tds-stale` delays its pulse; `.tds-nav-progress` is driven by `mountNavProgress()`. A ClientRouter host renders
  the progress node in every document with the same `transition:persist` key.

## `src/markdown/`

Escape-first `renderMarkdown` → HTML. Its output goes into `dangerouslySetInnerHTML` in the blog-CMS preview and the
customer wiki. Escaping runs before any markdown transform. Change it only with its test suite.

## Server origin

**Never take a public origin from `request.url` in server code.** Astro's Node adapter builds it from the socket and
ignores `X-Forwarded-Proto`; TLS ends at Plesk's nginx, so it always reads `http://`. `connection/service.ts` uses
`requestOrigin()`, which reports HTTPS for any non-loopback host.

## `scripts/`: the release spine for SSR consumers

`scripts/pack-release.mjs` assembles the deploy tree (`app.cjs`, `package.json`, `server/`, `client/`, a prebuilt
`node_modules/`, `tmp/`); `scripts/app.cjs` is the canonical Passenger startup file. Consumed **by path** as a
`postbuild`:

```jsonc
"postbuild": "node node_modules/@tracht-digital-solutions/tds-shared/scripts/pack-release.mjs"
```

- No `exports` entry is needed, but `"scripts"` must be in `files` (`releaseScripts.test.ts`).
- `root` is `process.cwd()` (the consumer's), never derived from `import.meta.url`.
- The startup file is looked up in the consumer first; panel products have none.
- **`verify()` runs on every build** and is the authority on `vite.ssr.noExternal` and
  `tds.release.runtimeDependencies`: it fails naming any first-party import left in `server/` and any bare specifier
  that doesn't resolve in the packed tree.

## Publishing

| Workflow | Trigger | Result |
|---|---|---|
| Dev prerelease | push to `main` | `<version>-dev.<run>` under `@dev` |
| Release | manual button | bumps version, tags, builds, publishes `@latest` |

Don't run `npm version`; land changes on `main` and press the button. Consumers pin minor-locked 0.x carets, so a new
minor needs an explicit repin **and release** in each consumer, verified from a fresh `npm install --no-package-lock`.

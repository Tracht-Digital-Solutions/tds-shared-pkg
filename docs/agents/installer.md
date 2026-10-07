# `src/install/`: the host-side setup wizard

A React island exported as `@tracht-digital-solutions/tds-shared/install`; each public site mounts it from a thin
`src/pages/install.astro` with `noindex`.

**On the site domains nothing executes** (PHP is disabled on every frontend subdomain; only `api.tracht-digital.de`
runs PHP). Whatever ships there must work as a static file. The wizard used to be PHP and could never run.

| File | Role |
|---|---|
| `profiles.ts` | The site profiles as typed objects; the only place the sites differ |
| `checks.ts` | Pure logic and individual fetches; the half worth testing |
| `InstallWizard.tsx` | The island; presentation |

## What it can and cannot do

A browser can't write to the docroot, so it **installs nothing**. It verifies the connection, generates
`tds-runtime.json`, and confirms the placed file is served (a missing config is silent, because every content fetch is
fail-soft). Its checks run on the same path the site uses: same origin, same CORS, same browser.

## A green route must not report red

A false alarm costs more than a missing check, because the operator's first move is to "fix" something that works.

- **Payload nodes are counted as a list or a map.** `posts` is a list; `blocks` (`/content/landing`), `docs`
  (`/content/legal`) and `/healthz`'s `services` are maps. `null` means genuinely uncountable.
- **A route that can only be empty isn't a check** (`/content/snippets` is always `[]`; `installer.test.ts` keeps it out).
- When a probe is red and the site's own traffic is fine, suspect the probe's target (the gateway's `/healthz` once had no
  CORS).

## Step 5: the site key

`POST /sites/handshake` with the key issued under *Einstellungen → Site-Verbindungen*; the only moment the API learns a
site exists.

- **The key never enters `tds-runtime.json`** (served publicly). `RUNTIME_KEYS` is not extended, and `installer.test.ts`
  asserts no generated config contains a key. In builds it is the CI secret `TDS_SITE_KEY`.
- **It goes in the request body**, not a header or the query string.
- **`cors: "missing"` is a warning**, not a success.
- **`RegistrySync` (tools only)** reuses the key and reads `synced` from the response.

## Four things to keep true

- **Never claim a reason for a failed cross-origin fetch.** DNS, TLS, a dead host and CORS are indistinguishable;
  `Reachability` has one `"blocked"` bucket. A `no-cors` probe may only narrow it (`installChecks.test.ts`).
- **The confirm step must not use `runtimeConfig()`** (memoised, default cache). Use `readPublishedConfig()`:
  `cache: "no-store"`, a `?t=` buster and a content-type check.
- **There is no login.** The page writes nothing, and a password form on a public domain would be a phishing surface.
- **It can only test the origin it is loaded on**; `profile.origins` tells the operator which others to visit.

## Adding a site

Add a profile to `profiles.ts` and a `src/pages/install.astro` in the repo, and keep `/install` out of that site's sitemap
(a noindex page in the sitemap, or a German-only page with hreflang alternates, is a silent SEO defect).

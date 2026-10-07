# Theme, preferences, motion and the phone app shell

## `themeBootstrapScript` (`src/astro`): the one no-flash theme script

- **Inject with `set:html`:** `<script is:inline set:html={themeBootstrapScript} />`. As a template body
  (`{themeBootstrapScript}`) the braces leak into `dist/` and the script never parses. Check `dist/`: the
  `"tds-theme"` quotes and `&&` must come out unescaped.
- **Keep `is:inline` and keep it in `<head>`** (otherwise it's hoisted and the theme lands after first paint). In the
  panel host it stays before the pre-paint gate.
- **A `ClientRouter` host also needs its `astro:before-swap` half**: the bootstrap writes the preference onto
  `event.newDocument.documentElement` before the swap. Don't move this listener into the host.
- `THEME_STORAGE_KEY` / `THEME_ATTRIBUTE` (`./design`) are the contract between bootstrap, `ThemeToggle` and `base.css`.
  Import them; don't retype `"tds-theme"`.

## `applyThemePreference` (`./theme`): the only write path

It raises `tds:theme-change`, which the account sync listens to; a hand-rolled write stays per browser.

- **`"system"` is the absence of a stored value**; applying it removes the key.
- **Pass `{ announce: false }` for values that came from the server.**
- **`startSystemThemeSync()` is required if you offer "System".**

## Visitor preferences (`./prefs`)

The `tds_prefs` cookie on `.tracht-digital.de` holds theme, locale and the blog's reader settings (`PREF_VALUES`, mirrored
by `PreferenceWhitelist.php` in `tds-core-frontend-api`). `themeBootstrapScript` reads it before first paint and
publishes `window.__tdsPrefs` for other pre-paint scripts; `applyThemePreference` writes it. `startAccountPrefsSync()`
reconciles with `/me/preferences` for signed-in visitors (apply server values with `announce: false`).

## Motion

**CSS for pages, `./motion/react` for islands.** CSS covers page transitions (`styles/page-transitions.css`), scroll
reveal (`.tds-reveal`), `<details>` (`.tds-disclosure`) and the dropdown. Motion is for what CSS can't do: a node
leaving the DOM, siblings reflowing, shared-element glides (`layoutId`).

1. **Never ship SSR content hidden.** Every primitive mounts with `initial={false}`; `motionReact.test.tsx` renders each
   to a string and rejects `opacity:0`. Never put `.tds-reveal` on a hero.
2. **A leaving element is inert at once** (`useIsPresent` → `aria-hidden` + `inert`).
3. **Branch on the pointer, not the width** (`useCoarsePointer`); swipe to dismiss is touch-only.
4. **`motion` is pinned exactly** and is a dependency here (not a peer). Bump deliberately and re-verify in a browser.

- Motion clocks with `performance.now()`, which fake timers don't move; test the accessible state.
- **`./motion/dom`** is the vanilla runtime (`animate`, `inView`, `hover`, `press`, `scroll`, `stagger`, presets,
  `pointerSpring`, `prefersReducedMotion()`, `hasFinePointer()`) for server-rendered pages. Consumers `import()` it after
  first paint and never import `motion` themselves; start states are set from JS, off screen only.
- `cssEase` + `durations` from `./motion` serve JS-driven animation.

### Durations and reduced motion

- **Every duration and easing comes from a token.** Loops have their own scale (`--tds-dur-spin`, `--tds-dur-pulse`,
  `--tds-ease-spin`).
- **Reduced motion resets end states, not just durations.** The global clamp shortens time with `!important`, but a
  clamped transition still arrives; `base.css` resets the offending transforms, reverts `scroll-behavior` and flattens
  the spinner to an even ring.

## The phone app shell (`./app` + `styles/app-shell.css`, opt-in)

- **`.tds-tabbar` publishes `--tds-tabbar-lane`**; every bottom-fixed element adds it (`prefs.test.ts`), and the cookie
  notice rides on the bar.
- **Sheets** are modal `<dialog class="tds-sheet">` with the counted scroll lock. Pointer capture starts only after a few
  pixels of drag, or the close button in the grab area stops receiving clicks. Sheets swipe in from their tab's side
  (`data-from`).
- **No top bar on a phone:** below 64rem `.tds-app .tds-app-header` is the page's first line (static, transparent).
- A tab or the language switch hands the next page's slide direction via `sessionStorage["tds-nav-dir"]` to
  `pageDirectionScript`; the theme segmented control swipes (`swipeTransition`).
- **Tab pages instead of sheets** (`mountTabPages(bar)`, `src/app/tabPages.ts`): a tab with `data-tab-page` opens a
  full-screen `.tds-tabpage` above content and below the bar, sliding in from its side; a horizontal swipe moves to the
  neighbouring tab (a link tab navigates); Back closes (one pushed entry, replaced while switching). The rest of the body
  is `inert`, **not the bar**; never a modal `<dialog>` (the bar would die). An in-page `#` link closes the page by
  rewriting the entry.
- `mountLiveFilter` is the Discover pattern (present while empty, search while typing, diacritics folded).
- Classes: `.tds-linkgroup` (joined button row), `.tds-segmented--icons`, `.tds-tile`, `.tds-searchfield`.
- Sitemap helpers: `renderSectionedSitemapIndex`, `newestDay`.

## PWA (`./pwa`)

Pages are network-first; only `/_astro/` is cache-first (a cache-first page would hide a broken deploy). Serve `/sw.js`
and `/manifest.webmanifest` from **prerendered** endpoints so the worker version changes per build.

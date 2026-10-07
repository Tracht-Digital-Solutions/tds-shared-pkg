# Testing

`npm run test:run` runs the vitest suite in `src/__tests__/`.

## `design.test.ts` guards the CSS contracts

Every failure mode in the design system is silent in a browser (a missing token resolves to nothing, an unknown variant
renders uncoloured). The suite pins, among others: surface layers declare only tokens and reference only defined tokens;
hairline vs separator; flat fill counterparts; shadow scoping; the panel base accent; no `--nav-hue` on `.nav-item`;
contrast of text roles through the real token chain; toast variants; `.tds-modal` without `z-index` / `position: fixed`;
no `outline: none` in `:focus`; lane publishers set and clear; durations from tokens; no token names with digits.

## Other suites worth knowing

| Suite | Covers |
|---|---|
| `motionReact.test.tsx` | Each motion primitive renders to a string without `opacity:0`; no static `motion` import in `./components` |
| `api.test.ts` | Cross-entry transport state; runtime config resolution |
| `installer.test.ts`, `installChecks.test.ts` | Profiles, no key in generated config, list/map counting, reachability wording |
| `releaseScripts.test.ts` | `scripts` is in `files` |
| `PostCover.test.tsx` | No bare `var(--tds-flat-tint)` |
| `AccountMenu.test.tsx` | Absolute auth origin for writes, DELETE logout, hint keys |
| `prefs.test.ts` | Bottom-fixed elements add `--tds-tabbar-lane` |
| `LiveChatCta.test.tsx` | See below |

## `vi.stubGlobal` is not undone by `vi.restoreAllMocks()`

`vitest.config.ts` sets `unstubGlobals: true`; rely on it. A leaked stub makes `vi.spyOn` return the same mock, so later
tests share one call history. A count assertion that only fails in the full file is contamination, not logic.

## LiveChatCta (`src/__tests__/LiveChatCta.test.tsx`)

The visitor-facing support bubble on the landing page, blog, portal and tools site. Negative assertions first, because the
failure is a bubble nobody switched on:

- **Nothing renders** while config loads, when `enabled: false`, when the config request fails or the backend is
  unreachable, or when every tab is off.
- The hide flag is **per frontend** (`tds-live-chat-hidden:<frontend>`); a blocked `localStorage` must not crash it.
- The panel lands on the **first enabled** tab.
- Chat: the session token travels as the **`X-Chat-Token` header, never in the URL**; sessions are per frontend; the poll
  cursor advances; the interval is cleared on unmount; Enter sends, Shift+Enter inserts a newline.
- Contact: the **honeypot** is in the payload and unreachable to people (`tabIndex={-1}`, `aria-hidden`, off-screen); a
  **429** says "too many requests".
- Admin-authored FAQ/doc text renders through `Prose` (React escaping), asserted with an `<img onerror>`.

Mutation check: 43 breakages, 43 caught.

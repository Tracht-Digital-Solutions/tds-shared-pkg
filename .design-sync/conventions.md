# Tracht Digital Solutions — shared design system (`tds-shared`)

This is the brand foundation shared across the four TDS frontends: **design
tokens + editorial chrome (CSS)**, the **`ThemeToggle`** React component, plus
i18n strings, Zod schemas and motion presets. Build UIs from the tokens and
chrome classes below — they are the brand.

## Setup

Components import from `window.TdsShared` (the bound bundle); the look comes
from `styles.css` (brand tokens + Tailwind utilities + the chrome classes).
No provider is required — `ThemeToggle` reads/writes `data-theme` on
`<html>` directly. Dark mode is driven by a single attribute:

```html
<html data-theme="light">  <!-- or "dark" -->
```

All structural tokens flip when `data-theme="dark"` is set; set it on the root
to theme an entire design.

## Styling idiom

Two layers, used together:

**1. Brand tokens — `var(--*)`, defined in `styles.css` `:root` (and flipped under
`[data-theme="dark"]`).** Use these for every brand colour/font instead of raw
hex:

| Token | Role |
|---|---|
| `--color-primary` | brand navy (flips lighter in dark) |
| `--color-accent` | burgundy accent (→ pink in dark) |
| `--color-accent-pink` | pink accent |
| `--color-paper` | page background |
| `--color-soft` | alternate section background |
| `--color-card` | elevated/glass surface |
| `--color-line` | hairline borders/dividers |
| `--color-muted` | secondary text |
| `--color-ink` / `--color-black` | body / strong text |
| `--color-surface-navy` / `--color-surface-accent` / `--color-surface-ink` | **fixed** dark surfaces that stay dark in BOTH themes (use for fixed dark panels/buttons; never use a flipping token as a fixed dark backdrop) |
| `--font-display` | Lato (headings + wordmark) |
| `--font-body` | Geist (UI/body) |

**2. Editorial chrome classes** (plain CSS in `styles.css`) — ready-made brand
primitives; prefer them over re-deriving from tokens:
`.display` / `.display-tight` (Lato headings), `.accent-italic`,
`.eyebrow` (uppercase tracked label), `.lead`, `.section-spacing`,
`.section-num`, plus app chrome: `.btn` with `.btn-primary` / `.btn-accent` /
`.btn-ghost`, `.field` / `.field-boxed`, `.chip` (`.chip-active` /
`.chip-solid`), `.brand-header` / `.brand-wordmark`, and the
`.hairline` / `.editorial-grid` layout helpers.

Tailwind utility classes also resolve (the bundle ships a compiled set), but
**brand colour/spacing should go through the tokens** so designs stay on-theme
and dark-mode-correct.

## Where the truth lives

- `styles.css` — the full token set, the dark-mode overrides, and every chrome
  class. Read it before styling; it is authoritative.
- `components/general/ThemeToggle/ThemeToggle.d.ts` + `.prompt.md` — the one
  component's API.

## Build snippet

```jsx
// A header bar using the DS: ThemeToggle (real component) + brand tokens.
function Header() {
  return (
    <header
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "1.5rem", padding: "0.5rem 1rem", borderRadius: 9999,
        border: "1px solid var(--color-line)",
        background: "color-mix(in srgb, var(--color-card) 72%, transparent)",
      }}
    >
      <span className="display" style={{ fontSize: "1.25rem", color: "var(--color-primary)" }}>
        Tracht <span className="accent-italic">Digital</span>
      </span>
      <TdsShared.ThemeToggle />
    </header>
  );
}
```

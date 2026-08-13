/**
 * Design-library runtime helpers.
 *
 * Consumed via
 * `import { resolveChipVariant } from "@tracht-digital-solutions/tds-shared/design"`.
 *
 * Pure functions only — no side effects, so tree-shaking still works
 * (`sideEffects: ["*.css"]` in package.json).
 */

/** Semantic (state) chip variants defined in styles/primitives.css. */
export const SEMANTIC_CHIP_VARIANTS = [
  "neutral",
  "success",
  "warning",
  "danger",
  "info",
] as const;

/** Categorical (wayfinding) chip variants defined in styles/primitives.css. */
export const CATEGORICAL_CHIP_VARIANTS = [
  "cat-violet",
  "cat-teal",
  "cat-amber",
  "cat-rose",
  "cat-cyan",
] as const;

export type SemanticChipVariant = (typeof SEMANTIC_CHIP_VARIANTS)[number];
export type CategoricalChipVariant = (typeof CATEGORICAL_CHIP_VARIANTS)[number];
export type ChipVariant = SemanticChipVariant | CategoricalChipVariant;

/**
 * Every variant that actually has a `.chip--*` rule. Anything not in here
 * would render as an unstyled pill.
 */
export const CHIP_VARIANTS: readonly ChipVariant[] = [
  ...SEMANTIC_CHIP_VARIANTS,
  ...CATEGORICAL_CHIP_VARIANTS,
];

/**
 * Bare colour names accepted as aliases of the categorical variants.
 *
 * Two reasons this mapping exists:
 *  - the panel historically wrote `.chip--violet` / `--teal` / `--amber` /
 *    `--rose`, which matched no rule at all (five badges rendered with no
 *    colour coding), and
 *  - ticket status colours come out of the `support_tickets_status` table,
 *    where an admin types a short colour name.
 */
const CHIP_ALIASES: Readonly<Record<string, ChipVariant>> = {
  violet: "cat-violet",
  purple: "cat-violet",
  teal: "cat-teal",
  green: "success",
  amber: "cat-amber",
  orange: "cat-amber",
  yellow: "warning",
  rose: "cat-rose",
  pink: "cat-rose",
  red: "danger",
  cyan: "cat-cyan",
  blue: "info",
  grey: "neutral",
  gray: "neutral",
};

const VARIANT_SET: ReadonlySet<string> = new Set(CHIP_VARIANTS);

/**
 * Map an untrusted variant name to a chip class that definitely exists.
 *
 * Use this wherever the variant is NOT a literal in the source — most
 * importantly the support-ticket board, which renders a status colour
 * straight out of the database:
 *
 * ```tsx
 * // WRONG: Tailwind cannot statically extract an interpolated class, and
 * // an unknown DB value renders an unstyled pill.
 * <span className={`chip chip--${status.color}`} />
 *
 * // RIGHT:
 * <span className={`chip ${resolveChipVariant(status.color)}`} />
 * ```
 *
 * Returns the full modifier class (e.g. `"chip--cat-teal"`), falling back
 * to `"chip--neutral"` for anything unrecognised, empty or nullish. Every
 * class this can return is present in styles/primitives.css, so the
 * returned value is always styled.
 */
export function resolveChipVariant(
  color: string | null | undefined,
  fallback: ChipVariant = "neutral",
): string {
  const key = (color ?? "").trim().toLowerCase();
  if (VARIANT_SET.has(key)) return `chip--${key}`;
  const aliased = CHIP_ALIASES[key];
  if (aliased) return `chip--${aliased}`;
  return `chip--${fallback}`;
}

/** True when `color` maps to a real chip variant (no fallback needed). */
export function isKnownChipColor(color: string | null | undefined): boolean {
  const key = (color ?? "").trim().toLowerCase();
  return VARIANT_SET.has(key) || key in CHIP_ALIASES;
}

/**
 * Toast variants — the `.tds-toast--*` rules in styles/base.css.
 *
 * Deliberately the SEMANTIC chip vocabulary minus `neutral`: a toast always
 * carries a signal, and a fifth word for "red" (`error`) would split the
 * library's vocabulary the way `.chip--violet` once did. `design.test.ts`
 * asserts this list against the rules actually defined in the stylesheet, so
 * a variant can never be shipped without a colour.
 */
export const TOAST_VARIANTS = ["success", "warning", "danger", "info"] as const;
export type ToastVariant = (typeof TOAST_VARIANTS)[number];

const TOAST_VARIANT_SET: ReadonlySet<string> = new Set(TOAST_VARIANTS);

/**
 * Map an untrusted variant to one that definitely has a rule.
 *
 * The toast bus is a window event, so a `detail.variant` can come from code
 * this library never type-checked (an older extension, a console call). Same
 * doctrine as {@link resolveChipVariant}: never render an uncoloured signal.
 */
export function resolveToastVariant(
  variant: string | null | undefined,
  fallback: ToastVariant = "info",
): ToastVariant {
  const key = (variant ?? "").trim().toLowerCase();
  return TOAST_VARIANT_SET.has(key) ? (key as ToastVariant) : fallback;
}

/** The three design surfaces. Each app sets one on `<html data-surface>`. */
export const SURFACES = ["marketing", "blog", "panel"] as const;
export type Surface = (typeof SURFACES)[number];

/**
 * The attribute the theme lives on, and the localStorage key it persists to.
 *
 * These two are a **contract between three places**: the no-flash bootstrap
 * (`themeBootstrapScript`, tds-shared/astro) READS the key in `<head>` before
 * paint, `ThemeToggle` WRITES it, and `styles/base.css` selects on the
 * attribute (`[data-theme="dark"]`). All three hardcoded the same literals
 * independently — a rename in one would have silently split the toggle from
 * the bootstrap (theme persists, but every reload flashes the OS default).
 * Import these instead of retyping the strings.
 */
export const THEME_STORAGE_KEY = "tds-theme";
export const THEME_ATTRIBUTE = "data-theme";

/** The two theme values. Anything else in storage is ignored as corrupt. */
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/**
 * What a USER chooses, as opposed to what the document ends up rendering.
 *
 * `"system"` is deliberately **not** a stored value: it is the absence of one.
 * The no-flash bootstrap already falls through to `prefers-color-scheme` when
 * the key is missing, so "follow the OS" costs no bootstrap change and cannot
 * drift from it — writing a literal `"system"` into storage would make the
 * bootstrap treat it as corrupt and land on the OS theme anyway, by accident
 * rather than by design.
 */
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/**
 * Raised on `window` whenever the theme preference changes, with
 * `detail: { preference, theme }`.
 *
 * A window `CustomEvent` for the same reason the toast bus is one: Astro
 * mounts every `client:*` island as its own React root (up to 17 on the panel
 * dashboard), so there is no common tree to hang a provider on — and the
 * listener here is the frontend host's plain-TS preferences module, not React.
 * `ThemeToggle` and the profile page both write through
 * `applyThemePreference` (tds-shared/theme), so whoever persists the choice
 * server-side subscribes once and hears both.
 */
export const THEME_CHANGE_EVENT = "tds:theme-change";

/** `detail` of a {@link THEME_CHANGE_EVENT}. */
export interface ThemeChangeDetail {
  /** What the user chose — `"system"` included. */
  preference: ThemePreference;
  /** What that resolves to right now, i.e. what `data-theme` was set to. */
  theme: Theme;
}

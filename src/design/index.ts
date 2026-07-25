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

/** The three design surfaces. Each app sets one on `<html data-surface>`. */
export const SURFACES = ["marketing", "blog", "panel"] as const;
export type Surface = (typeof SURFACES)[number];

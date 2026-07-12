export interface SpinnerProps {
  /**
   * Diameter preset. `sm` (~1rem) sits inline in a button next to its label,
   * `md` (~1.5rem, default) for inline/standalone use, `lg` (~2.25rem) for a
   * centered section/overlay indicator.
   */
  size?: "sm" | "md" | "lg";
  /**
   * Arc colour. `current` (default) inherits `currentColor` so the spinner is
   * visible on any button/background (e.g. white on a navy primary button).
   * `primary` pins the brand `--color-primary` for a standalone indicator on a
   * neutral surface.
   */
  tone?: "current" | "primary";
  /** Accessible name announced to screen readers. Defaults to "Wird geladen". */
  label?: string;
  className?: string;
}

/**
 * Rotating ring spinner. Styled by the `.tds-spinner` class in
 * `@tracht-digital-solutions/tds-shared/styles/base.css` (base, not app.css, so
 * the marketing site gets it too — like `.cookie-notice`). Uses the brand
 * `tds-spin` keyframe; the global reduced-motion clamp in base.css freezes it to
 * a static ring for users who ask for less motion. `role="status"` + the
 * accessible label announce the pending state.
 */
export default function Spinner({
  size = "md",
  tone = "current",
  label = "Wird geladen",
  className,
}: SpinnerProps) {
  const classes = ["tds-spinner"];
  if (size === "sm") classes.push("tds-spinner--sm");
  else if (size === "lg") classes.push("tds-spinner--lg");
  if (tone === "primary") classes.push("tds-spinner--primary");
  if (className) classes.push(className);
  return <span className={classes.join(" ")} role="status" aria-label={label} />;
}

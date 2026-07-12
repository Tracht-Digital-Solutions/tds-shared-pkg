import type { CSSProperties } from "react";

export interface SkeletonProps {
  /** CSS width (number → px). Default `100%`. */
  width?: string | number;
  /** CSS height (number → px). Default `1em`. */
  height?: string | number;
  /** Override the corner radius (number → px). */
  radius?: string | number;
  /** Render a circle (equal width/height + full radius) — e.g. an avatar. */
  circle?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * A single pulsing placeholder block. Styled by the `.tds-skeleton` class in
 * `@tracht-digital-solutions/tds-shared/styles/base.css`. Decorative
 * (`aria-hidden`) — wrap a group of skeletons in a container carrying
 * `role="status"` + an accessible label so the pending state is announced once.
 * The global reduced-motion clamp freezes the pulse to a static block.
 */
export default function Skeleton({
  width = "100%",
  height = "1em",
  radius,
  circle = false,
  className,
  style,
}: SkeletonProps) {
  const classes = ["tds-skeleton"];
  if (circle) classes.push("tds-skeleton--circle");
  if (className) classes.push(className);
  const merged: CSSProperties = { width, height, ...style };
  if (radius != null) merged.borderRadius = radius;
  return <span className={classes.join(" ")} style={merged} aria-hidden="true" />;
}

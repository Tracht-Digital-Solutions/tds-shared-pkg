import Skeleton from "./Skeleton";

export interface SkeletonTextProps {
  /** Number of placeholder lines. Default `3`. */
  lines?: number;
  /** Width of the final (usually short) line. Default `"60%"`. */
  lastLineWidth?: string;
  className?: string;
}

/**
 * A stack of placeholder text lines built on {@link Skeleton}, with a shorter
 * last line so it reads as a paragraph. Styled by `.tds-skeleton-text` in
 * `@tracht-digital-solutions/tds-shared/styles/base.css`. Decorative
 * (`aria-hidden`) — announce the pending state on the surrounding container.
 */
export default function SkeletonText({
  lines = 3,
  lastLineWidth = "60%",
  className,
}: SkeletonTextProps) {
  const classes = ["tds-skeleton-text"];
  if (className) classes.push(className);
  return (
    <span className={classes.join(" ")} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="0.8em"
          width={i === lines - 1 ? lastLineWidth : "100%"}
        />
      ))}
    </span>
  );
}

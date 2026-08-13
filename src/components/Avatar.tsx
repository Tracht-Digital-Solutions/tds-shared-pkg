import { useState } from "react";

import { CATEGORICAL_CHIP_VARIANTS } from "../design/index.js";

export interface AvatarProps {
  /** Display name. Drives the initials fallback and the accessible name. */
  name?: string | null;
  /** Image URL. Falls back to initials when absent, empty, or it fails to load. */
  src?: string | null;
  /**
   * Stable identity used to pick the fallback colour, so one person keeps the
   * same tint everywhere. Falls back to {@link AvatarProps.name}.
   */
  seed?: string | number | null;
  /** `sm` 1.75rem · `md` 2.25rem (default) · `lg` 4.5rem. */
  size?: "sm" | "md" | "lg";
  /**
   * Set when the avatar sits next to the same person's name in the same
   * control — the image is then decoration and repeating the name would make
   * a screen reader say it twice.
   */
  decorative?: boolean;
  className?: string;
}

/**
 * Initials taken from the first and last word — "Julian Tracht" → "JT",
 * "Julian" → "J". Falls back to "?" so the circle is never empty.
 *
 * `Array.from` rather than `charAt`: a name starting outside the BMP (an emoji
 * in a display name is not hypothetical) would otherwise be cut mid-surrogate
 * and render as a replacement character.
 */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const head = (value: string | undefined) => Array.from(value ?? "")[0] ?? "";
  const first = head(words[0]);
  const last = words.length > 1 ? head(words[words.length - 1]) : "";
  return (first + last).toUpperCase() || "?";
}

/** djb2 — the same cheap stable hash the frontend host uses for nav hues. */
function hash(value: string): number {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) {
    h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * User avatar — an image when there is one, otherwise a tinted circle of
 * initials.
 *
 * Geometry and colour come from `.tds-avatar` in
 * `@tracht-digital-solutions/tds-shared/styles/primitives.css`; this component
 * only picks which of the categorical hues the fallback uses, derived from a
 * stable seed so a person's colour doesn't change between the profile menu and
 * a user list.
 *
 * A broken `src` falls back to initials rather than rendering the browser's
 * broken-image glyph — avatars point at a service that may not be deployed
 * yet, and an empty grey box in the shell's top-right reads as a bug.
 */
export default function Avatar({
  name,
  src,
  seed,
  size = "md",
  decorative = false,
  className,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);

  const label = (name ?? "").trim();
  const classes = ["tds-avatar"];
  if (size === "sm") classes.push("tds-avatar--sm");
  else if (size === "lg") classes.push("tds-avatar--lg");
  if (className) classes.push(className);

  const showImage = Boolean(src) && !failed;
  const variant =
    CATEGORICAL_CHIP_VARIANTS[
      hash(String(seed ?? label ?? "")) % CATEGORICAL_CHIP_VARIANTS.length
    ];

  // `aria-hidden` on a decorative avatar, otherwise the name — an <img alt="">
  // next to the same name read twice is noise, but a bare avatar with no
  // accessible name is a control the reader cannot identify.
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img", "aria-label": label || "Profilbild" };

  if (showImage) {
    return (
      <img
        {...a11y}
        alt={decorative ? "" : label}
        src={src ?? undefined}
        className={classes.join(" ")}
        onError={() => setFailed(true)}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <span
      {...a11y}
      className={classes.join(" ")}
      data-avatar-variant={variant}
    >
      <span aria-hidden="true">{initialsOf(label)}</span>
    </span>
  );
}

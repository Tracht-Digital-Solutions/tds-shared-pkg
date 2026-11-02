import type { CSSProperties } from "react";
import { tdsPlaceholder } from "../site/placeholder";

/**
 * Article covers for posts without a picture, drawn by the shared generator
 * (`site/placeholder.ts`). The variant comes from the slug, so a post looks the
 * same on every property.
 */

export interface AbstractCoverProps {
  /** Any number; the same one always draws the same picture. */
  variant: number;
  style?: CSSProperties;
  className?: string;
}

export function AbstractCover({ variant, style, className }: AbstractCoverProps) {
  return (
    <img
      src={tdsPlaceholder({ seed: `cover-${variant}` })}
      alt=""
      aria-hidden="true"
      className={className}
      style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", ...style }}
    />
  );
}

/** Stable cover variant per post — hash the slug into 1..6. */
export function coverVariant(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return (Math.abs(h) % 6) + 1;
}

/**
 * `true` when the post carries a real picture we can render as an `<img>`:
 * either an uploaded absolute URL or a site-local asset path. Exported because
 * the landingpage's Astro card has to make the same decision *outside* React
 * (it renders the photo itself so `<Image />`-style attributes stay in the
 * template) — and two different rules for "is there a cover" is exactly how the
 * two surfaces drifted apart in the first place.
 */
export function hasPhotoCover(coverHint?: string | null): boolean {
  if (!coverHint) return false;
  return /^https?:\/\//i.test(coverHint) || /^\/.+\.(webp|avif|png|jpe?g|svg)$/i.test(coverHint);
}

import type { ImageAttributes } from './imageAttributes';

export interface PostCoverProps {
  image?: ImageAttributes;
  slug: string;
  coverHint?: string | null;
  title?: string;
  style?: CSSProperties;
  className?: string;
}

/** Photo cover when the post carries an explicit URL, abstract geometry otherwise. */
export function PostCover({ slug, coverHint, title, style, className, image }: PostCoverProps) {
  if (hasPhotoCover(coverHint)) {
    return (
      <img
        src={coverHint as string}
          alt={image?.alt ?? title ?? ""}
        loading="lazy"
          decoding="async"
          {...image}
        className={className}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...style }}
      />
    );
  }
  return <AbstractCover variant={coverVariant(slug)} style={style} className={className} />;
}

export default PostCover;

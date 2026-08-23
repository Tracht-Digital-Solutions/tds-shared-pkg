import type { CSSProperties } from "react";

/**
 * Flat brand-geometry article covers — six variants built from solid colour
 * blocks, hairline circles and the accent square. No gradients, no radii
 * (except the circles), which is what keeps them on-brand on every surface.
 *
 * These started life in `tds-blog-frontend/src/components/Covers.tsx` and moved
 * here when the landingpage's Journal row needed the SAME artwork: a post
 * without an uploaded cover has to look identical on both properties, and the
 * variant is derived from the slug, so one implementation is the only way that
 * stays true. The landingpage used to show a labelled grey box (and three
 * hand-hosted stock photos) instead — two surfaces, two different pictures of
 * the same article.
 *
 * Fixed dark variants use the `--color-surface-*` tokens so they stay navy/ink
 * in dark mode; the light variants use theme tokens and flip with it.
 *
 * NOTE on `--tds-flat-tint` (variant 4): that token is declared in
 * `styles/surfaces/blog.css` only. A marketing- or panel-surface consumer never
 * defines it, and an undefined custom property in `background` renders as
 * *nothing* — a blank cover with nothing red anywhere. Hence the inline
 * fallback, which is the blog layer's own formula.
 */

const abs = (s: CSSProperties): CSSProperties => ({ position: "absolute", ...s });

const FLAT_TINT = "var(--tds-flat-tint, color-mix(in srgb, var(--color-primary) 9%, var(--color-paper)))";

export interface AbstractCoverProps {
  /** 1..6 — anything else is folded into that range. */
  variant: number;
  style?: CSSProperties;
  className?: string;
}

export function AbstractCover({ variant, style, className }: AbstractCoverProps) {
  const v = ((Math.abs(variant) - 1) % 6) + 1;
  const base: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    height: "100%",
    ...style,
  };

  if (v === 1)
    return (
      <div className={className} style={{ ...base, background: "var(--color-surface-navy)" }} aria-hidden="true">
        <div style={abs({ right: "-12%", top: "-30%", width: "70%", aspectRatio: "1", borderRadius: "50%", border: "1.5px solid rgba(255,255,255,.35)" })} />
        <div style={abs({ right: "12%", bottom: "14%", width: "13%", aspectRatio: "1", background: "var(--color-surface-accent)" })} />
      </div>
    );
  if (v === 2)
    return (
      <div className={className} style={{ ...base, background: "var(--color-soft)" }} aria-hidden="true">
        <div style={abs({ left: "-10%", bottom: "-45%", width: "65%", aspectRatio: "1", borderRadius: "50%", background: "var(--color-surface-navy)" })} />
        <div style={abs({ right: "14%", top: "18%", width: "26%", height: 3, background: "var(--color-accent)" })} />
        <div style={abs({ right: "14%", top: "28%", width: "34%", aspectRatio: "1", borderRadius: "50%", border: "1.5px solid var(--color-primary)", opacity: 0.5 })} />
      </div>
    );
  if (v === 3)
    return (
      <div className={className} style={{ ...base, background: "var(--color-surface-ink)" }} aria-hidden="true">
        <div
          style={abs({
            inset: 0,
            opacity: 0.18,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            backgroundPosition: "22px 18px",
          })}
        />
        <div style={abs({ left: "18%", top: "30%", width: "17%", aspectRatio: "1", borderRadius: "50%", background: "var(--color-surface-accent)" })} />
        <div style={abs({ left: "42%", top: "30%", right: "14%", bottom: "32%", border: "1.5px solid rgba(255,255,255,.55)" })} />
      </div>
    );
  if (v === 4)
    return (
      <div className={className} style={{ ...base, background: FLAT_TINT }} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={abs({
              left: `${16 + i * 14}%`,
              top: `${34 - i * 8}%`,
              bottom: 0,
              width: "7%",
              background: i === 1 ? "var(--color-primary)" : "var(--color-surface-navy)",
              opacity: i === 1 ? 0.55 : 1,
            })}
          />
        ))}
        <div style={abs({ right: "16%", top: "22%", width: "10%", aspectRatio: "1", borderRadius: "50%", background: "var(--color-surface-accent)" })} />
      </div>
    );
  if (v === 5)
    return (
      <div className={className} style={{ ...base, background: "var(--color-surface-navy)" }} aria-hidden="true">
        <div style={abs({ left: "-18%", top: "-18%", width: "52%", aspectRatio: "1", borderRadius: "50%", background: "rgba(0,0,0,.35)" })} />
        <div style={abs({ right: "-8%", bottom: "-40%", width: "56%", aspectRatio: "1", borderRadius: "50%", border: "1.5px solid rgba(255,255,255,.3)" })} />
        <div style={abs({ left: "46%", top: "44%", width: "20%", height: 3, background: "var(--color-surface-accent)" })} />
      </div>
    );
  return (
    <div className={className} style={{ ...base, background: "var(--color-surface-ink)" }} aria-hidden="true">
      <div style={abs({ left: "14%", top: "24%", width: "30%", aspectRatio: "1", border: "1.5px solid rgba(255,255,255,.4)" })} />
      <div style={abs({ left: "26%", top: "44%", width: "30%", aspectRatio: "1", background: "var(--color-surface-navy)", filter: "brightness(1.8)" })} />
      <div style={abs({ right: "16%", top: "30%", width: "9%", aspectRatio: "1", borderRadius: "50%", background: "var(--color-surface-accent)" })} />
    </div>
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

export interface PostCoverProps {
  slug: string;
  coverHint?: string | null;
  title?: string;
  style?: CSSProperties;
  className?: string;
}

/** Photo cover when the post carries an explicit URL, abstract geometry otherwise. */
export function PostCover({ slug, coverHint, title, style, className }: PostCoverProps) {
  if (hasPhotoCover(coverHint)) {
    return (
      <img
        src={coverHint as string}
        alt={title ?? ""}
        loading="lazy"
        className={className}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...style }}
      />
    );
  }
  return <AbstractCover variant={coverVariant(slug)} style={style} className={className} />;
}

export default PostCover;

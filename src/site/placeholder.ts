/**
 * The one generator for placeholder pictures on every TDS site: a picture
 * wherever a real image is missing, drawn from the brand's constructed geometry
 * (capsule, quarter circle, outline rings, three-part bar).
 *
 * The seed decides the picture, so the same post or product looks the same on
 * every site and in every render. No DOM, no dependency: it returns a string
 * that works on the server, in an `<img>` and as a CSS background.
 *
 * Fixed colours rather than tokens: an SVG in a data URI sees no custom
 * properties. Each ground is one the brand also uses in dark mode.
 */
const NAVY = "#050f68";
const BORDEAUX = "#820933";
const CORAL = "#ff7a9c";
const SAND = "#f4efe6";
const INK = "#0b0a07";

/** Ground, main shape, second shape, line. Contrast is by construction. */
const SCHEMES = [
  [NAVY, CORAL, BORDEAUX, "#ffffff"],
  [SAND, NAVY, CORAL, NAVY],
  [BORDEAUX, CORAL, NAVY, "#ffffff"],
  [INK, CORAL, NAVY, "#ffffff"],
  [SAND, BORDEAUX, NAVY, BORDEAUX],
  [NAVY, "#ffffff", CORAL, CORAL],
] as const;

export interface PlaceholderOptions {
  /** Any stable value: a slug, an id. The same seed draws the same picture. */
  seed: string | number;
  width?: number;
  height?: number;
  /** One or two letters set large, for a tile that stands for something named. */
  monogram?: string;
}

/** A small stable hash, so nearby seeds still draw different pictures. */
export function placeholderHash(seed: string | number): number {
  const text = String(seed);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const escapeXml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** The picture as SVG markup. */
export function tdsPlaceholderSvg({ seed, width = 1200, height = 750, monogram }: PlaceholderOptions): string {
  const h = placeholderHash(seed);
  const [ground, main, second, line] = SCHEMES[h % SCHEMES.length]!;
  const u = Math.min(width, height);
  const flipX = (h >> 3) & 1;
  const flipY = (h >> 4) & 1;
  const x = (value: number) => (flipX ? width - value : value);
  const y = (value: number) => (flipY ? height - value : value);

  // The capsule, cut by the picture's edge, with its depth of outline rings.
  const capW = u * 0.95;
  const capH = u * 0.36;
  const capX = x(width * 0.72) - capW / 2;
  const capY = y(height * 0.78) - capH / 2;
  const rings = [1, 2, 3, 4]
    .map((step) => {
      const off = step * u * 0.022;
      return `<rect x="${(capX - off).toFixed(1)}" y="${(capY - off).toFixed(1)}" width="${capW.toFixed(1)}" height="${capH.toFixed(1)}" rx="${(capH / 2).toFixed(1)}" fill="none" stroke="${line}" stroke-opacity="${(0.42 - step * 0.07).toFixed(2)}" stroke-width="${(u * 0.004).toFixed(1)}"/>`;
    })
    .join("");
  const capsule = `<rect x="${capX.toFixed(1)}" y="${capY.toFixed(1)}" width="${capW.toFixed(1)}" height="${capH.toFixed(1)}" rx="${(capH / 2).toFixed(1)}" fill="${main}"/>`;

  // The quarter circle in the opposite corner.
  const r = u * (0.32 + ((h >> 6) % 12) / 100);
  const cx = x(0);
  const cy = y(0);
  const quarter = `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="${second}"/><circle cx="${cx}" cy="${cy}" r="${(r * 1.28).toFixed(1)}" fill="none" stroke="${line}" stroke-opacity="0.3" stroke-width="${(u * 0.004).toFixed(1)}"/>`;

  // The brand's three-part bar: long, medium, short.
  const barH = u * 0.022;
  const barLeft = flipX ? width * 0.08 : width * 0.6;
  const barTop = flipY ? height * 0.84 : height * 0.14;
  const bars = [
    [0, u * 0.2, line],
    [u * 0.225, u * 0.09, main],
    [u * 0.34, u * 0.045, second],
  ]
    .map(
      ([offset, w, colour]) =>
        `<rect x="${(barLeft + (offset as number)).toFixed(1)}" y="${barTop.toFixed(1)}" width="${(w as number).toFixed(1)}" height="${barH.toFixed(1)}" rx="${(barH / 2).toFixed(1)}" fill="${colour}"/>`,
    )
    .join("");

  const letters = monogram?.trim().slice(0, 2);
  const mark = letters
    ? `<text x="${width / 2}" y="${height / 2}" dy=".35em" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="${(u * 0.34).toFixed(1)}" fill="${line}" fill-opacity="0.9">${escapeXml(letters)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"><rect width="${width}" height="${height}" fill="${ground}"/>${quarter}${rings}${capsule}${bars}${mark}</svg>`;
}

/** The picture as a `data:` URI, for an `<img src>` or a CSS `url()`. */
export function tdsPlaceholder(options: PlaceholderOptions): string {
  return `data:image/svg+xml,${encodeURIComponent(tdsPlaceholderSvg(options))}`;
}

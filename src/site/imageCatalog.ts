/**
 * The editorial image catalogue the public sites generate (`imageCatalog.json`):
 * look up a picture by URL, emit its `srcset` hints and its JSON-LD
 * `ImageObject`. Promoted in 0.59 from four identical copies that differed only
 * in the origin and in what `about` points at.
 */

type Lang = "de" | "en";

export interface CatalogVariant {
  src: string;
  width: number;
  height: number;
  hash: string;
  bytes: number;
}

export interface CatalogAsset {
  src: string;
  width: number;
  height: number;
  alt: Record<Lang, string>;
  variants: CatalogVariant[];
  digitalSourceType: string;
}

export interface ImageCatalogOptions {
  /** The origin the images are served from, e.g. `https://tracht-digital.de`. */
  origin: string;
  /**
   * What the `ImageObject` is `about`: `"webpage"` → `<page>#webpage` (the
   * page declares a WebPage node with that id), `"page"` → the bare page URL.
   */
  about?: "webpage" | "page";
}

export function createImageCatalog(raw: Record<string, unknown>, { origin, about = "webpage" }: ImageCatalogOptions) {
  const assets = Object.values(raw) as CatalogAsset[];

  const imageInfo = (src?: string | null): CatalogAsset | undefined => {
    if (!src) return undefined;
    try {
      const url = new URL(src, origin);
      if (url.origin !== origin) return undefined;
      return assets.find((a) => a.src === url.pathname || a.variants.some((v) => v.src === url.pathname));
    } catch {
      return undefined;
    }
  };

  const imageHints = (src: string | null | undefined, lang: Lang, sizes = "100vw") => {
    const image = imageInfo(src);
    if (!image) return undefined;
    return {
      alt: image.alt[lang],
      width: image.width,
      height: image.height,
      // Site-relative on purpose. In production it is the same host, so
      // nothing changes there; but a dev or CI server rendering the page
      // fetched every variant from the LIVE origin — and when that host was
      // slow, the shop's accessibility audit never reached `networkidle`
      // (2026-10-21). Only the JSON-LD below needs the absolute URL.
      srcSet: image.variants.map((v) => `${v.src}?v=${v.hash} ${v.width}w`).join(", "),
      sizes,
      decoding: "async" as const,
    };
  };

  const imageObject = (src: string | null | undefined, lang: Lang, pageUrl: string) => {
    const image = imageInfo(src);
    if (!image) return null;
    return {
      "@type": "ImageObject",
      "@id": pageUrl + "#editorial-image",
      contentUrl: origin + image.src,
      url: origin + image.src,
      caption: image.alt[lang],
      width: image.width,
      height: image.height,
      encodingFormat: "image/webp",
      digitalSourceType: image.digitalSourceType,
      creditText: "Tracht Digital Solutions",
      about: { "@id": about === "webpage" ? pageUrl + "#webpage" : pageUrl },
    };
  };

  return { imageInfo, imageHints, imageObject };
}

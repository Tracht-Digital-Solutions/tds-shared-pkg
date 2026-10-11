import { z } from "zod";

/**
 * TDShop read model — the shape `/content/shop*` answers with, shared by the
 * three surfaces that render a product: the shop itself
 * (`tds-shop-frontend`), the journal (`tds-blog-frontend`, inline product
 * blocks and article-end recommendations) and the customer portal
 * (`tds-customer-frontend`, the placement widget).
 *
 * This is deliberately a READ model, not the write payload. The admin editor
 * in `tds-ext-shop-pkg` validates what it sends against its own schemas; what
 * lives here is only what a public consumer needs to render a product — which
 * is why there is no `draft`, no cost price, no Stripe id and no internal note
 * in any of it. A field that never reaches a browser has no business in the
 * shape three browsers share.
 */

/* --- offers -------------------------------------------------------------- */

/**
 * Where a product can be bought. `own` means TDS sells it and the price is
 * ours to state; `affiliate` means somebody else sells it and the price is a
 * quotation with an expiry date (see {@link isPriceStale}).
 */
export const SHOP_OFFER_KINDS = ["own", "affiliate"] as const;

/**
 * The partner programmes we resolve links for. `direct` covers a vendor's own
 * programme, which is the majority case and needs no per-network code —
 * only Amazon (PA-API) and the two feed networks do.
 */
export const SHOP_NETWORKS = [
  "amazon",
  "awin",
  "belboon",
  "digistore",
  "direct",
] as const;

export type ShopOfferKind = (typeof SHOP_OFFER_KINDS)[number];
export type ShopNetwork = (typeof SHOP_NETWORKS)[number];

// The price rules live in `./shopPrice` (zod-free, so the component barrel that
// renders a price does not pull zod onto every page); re-exported unchanged.
export { PRICE_MAX_AGE_MS, isPriceStale, displayPrice } from "./shopPrice";

export const ShopOfferSchema = z.object({
  id: z.number().int().positive(),
  kind: z.enum(SHOP_OFFER_KINDS),
  network: z.enum(SHOP_NETWORKS),
  /** Merchant-facing label ("Amazon", "Hetzner"), already localised by the API. */
  merchant: z.string().max(120),
  /** The outbound URL, affiliate tag already appended by the API. */
  url: z.string().max(1000),
  /** Net-of-nothing gross price in minor units; null when we have no quote. */
  priceCents: z.number().int().nonnegative().nullable(),
  currency: z.string().length(3).default("EUR"),
  /**
   * When {@link priceCents} was last confirmed, ISO-8601. Null means "never
   * fetched" — which is not the same as a stale price and renders differently:
   * a never-fetched offer simply shows no price, a stale one shows why.
   */
  priceCheckedAt: z.string().datetime({ offset: true }).nullable(),
  availability: z.enum(["in_stock", "out_of_stock", "unknown"]).default("unknown"),
  position: z.number().int().nonnegative().default(0),
});

export type ShopOffer = z.infer<typeof ShopOfferSchema>;

/* --- products ------------------------------------------------------------ */

/**
 * A product as a placement renders it: enough for a card, not the whole page.
 *
 * `teaser` rather than the body, one image, and the offers — an embedded card
 * in an article should never pull an article's worth of product prose across
 * the wire, and the block renderer has no way to show it if it did.
 */
export const ShopProductRefSchema = z.object({
  slug: z.string().max(120),
  lang: z.enum(["de", "en"]),
  title: z.string().max(200),
  teaser: z.string().max(400),
  category: z.string().max(60),
  imageUrl: z.string().max(1000).nullable(),
  /** Absolute URL of the product page on the shop site. */
  url: z.string().max(1000),
  offers: z.array(ShopOfferSchema).max(20).default([]),
});

export type ShopProductRef = z.infer<typeof ShopProductRefSchema>;

/** The full product page payload — {@link ShopProductRefSchema} plus its prose. */
export const ShopProductSchema = ShopProductRefSchema.extend({
  /** Blocks JSON or markdown, same dual format as a blog post body. */
  body: z.string(),
  bodyFormat: z.enum(["markdown", "blocks"]).default("blocks"),
  tags: z.array(z.string().max(60)).max(20).default([]),
  metaDescription: z.string().max(300).nullable(),
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  updatedAt: z.string().datetime({ offset: true }).nullable(),
  machineTranslated: z.boolean().default(false),
});

export type ShopProduct = z.infer<typeof ShopProductSchema>;

/* --- placements ---------------------------------------------------------- */

/**
 * A resolved advertising slot: the products to show and how to label them.
 *
 * One endpoint (`/content/shop/placement/{key}`) answers this for all three
 * placement mechanisms — a manually filled slot, an automatic
 * category/tag match, and the fixed slots in the journal sidebar and the
 * portal dashboard. The consumer does not need to know which it got, and that
 * is the point: the editorial decision stays in the panel instead of being
 * spread across three frontends.
 */
export const ShopPlacementSchema = z.object({
  key: z.string().max(60),
  /** Heading shown above the slot, already localised. Null renders no heading. */
  heading: z.string().max(120).nullable(),
  /**
   * The legally required advertising label ("Anzeige" / "Advertisement").
   *
   * Served rather than hard-coded so the label is right in both languages and
   * cannot be forgotten by a consumer — see `ProductCard`, which refuses to
   * render an affiliate offer without one.
   */
  label: z.string().max(60),
  products: z.array(ShopProductRefSchema).max(12).default([]),
});

export type ShopPlacement = z.infer<typeof ShopPlacementSchema>;

/** Empty placement — what every consumer renders when the shop is unreachable. */
export function emptyPlacement(key: string, lang: "de" | "en" = "de"): ShopPlacement {
  return {
    key,
    heading: null,
    label: lang === "de" ? "Anzeige" : "Advertisement",
    products: [],
  };
}

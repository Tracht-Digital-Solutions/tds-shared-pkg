import { describe, expect, it } from "vitest";

import {
  BLOG_BLOCKS,
  BlogBlockSchema,
  BlogDocumentSchema,
  PRICE_MAX_AGE_MS,
  ShopPlacementSchema,
  ShopProductRefSchema,
  displayPrice,
  emptyPlacement,
  isPriceStale,
} from "../schemas";

/**
 * The TDShop read model.
 *
 * Most of this shape is checked by `tsc`. What is tested here is the part a
 * type cannot express and that fails **silently and expensively**: a price
 * quote that outlives its licence. The Amazon Product Advertising API terms
 * allow a fetched price to be displayed for 24 hours; showing a stale one is
 * the term the partner programme is actually revoked over, and nothing in the
 * rendering path would look broken.
 */

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-09-07T12:00:00.000Z");

const offer = (checkedAgoMs: number | null, priceCents: number | null = 4999) => ({
  priceCents,
  currency: "EUR",
  priceCheckedAt: checkedAgoMs === null ? null : new Date(NOW - checkedAgoMs).toISOString(),
});

describe("price freshness", () => {
  it("keeps a quote fetched within the last 24 hours", () => {
    expect(isPriceStale(offer(23 * HOUR), NOW)).toBe(false);
    expect(displayPrice(offer(23 * HOUR), NOW)).toEqual({ cents: 4999, currency: "EUR" });
  });

  it("drops a quote older than 24 hours", () => {
    expect(isPriceStale(offer(25 * HOUR), NOW)).toBe(true);
    expect(displayPrice(offer(25 * HOUR), NOW)).toBeNull();
  });

  it("puts the boundary exactly at PRICE_MAX_AGE_MS, not a hair either side", () => {
    // Guards the comparison operator. `>=` here would drop a quote the licence
    // still permits on every render that lands on the exact millisecond, which
    // is the kind of off-by-one nobody reproduces on purpose.
    expect(isPriceStale(offer(PRICE_MAX_AGE_MS), NOW)).toBe(false);
    expect(isPriceStale(offer(PRICE_MAX_AGE_MS + 1), NOW)).toBe(true);
  });

  it("treats a never-fetched quote as unusable, not as fresh", () => {
    // The dangerous default. A null timestamp meaning "no expiry yet" would
    // display an unverified price forever.
    expect(isPriceStale(offer(null), NOW)).toBe(true);
    expect(displayPrice(offer(null), NOW)).toBeNull();
  });

  it("treats a missing price as unusable", () => {
    expect(isPriceStale(offer(1 * HOUR, null), NOW)).toBe(true);
    expect(displayPrice(offer(1 * HOUR, null), NOW)).toBeNull();
  });

  it("treats an unparseable timestamp as unusable rather than throwing", () => {
    // A malformed row from the API must degrade to "no price", never take the
    // product grid down with it.
    const bad = { priceCents: 999, currency: "EUR", priceCheckedAt: "not-a-date" };
    expect(isPriceStale(bad, NOW)).toBe(true);
    expect(displayPrice(bad, NOW)).toBeNull();
  });
});

describe("product read model", () => {
  it("accepts a product with no offers — a catalogue entry need not be buyable", () => {
    const parsed = ShopProductRefSchema.parse({
      slug: "fritzbox-7590-ax",
      lang: "de",
      title: "FRITZ!Box 7590 AX",
      teaser: "Router für kleine Büros.",
      category: "netzwerk",
      imageUrl: null,
      url: "https://shop.tracht-digital.de/produkt/fritzbox-7590-ax",
    });
    expect(parsed.offers).toEqual([]);
  });
});

describe("placements", () => {
  it("always carries an advertising label, in both languages", () => {
    // The label is served rather than hard-coded per consumer precisely so it
    // cannot be forgotten by one of the three surfaces that render a slot.
    expect(emptyPlacement("blog-article-end").label).toBe("Anzeige");
    expect(emptyPlacement("blog-article-end", "en").label).toBe("Advertisement");
    expect(ShopPlacementSchema.parse(emptyPlacement("x")).products).toEqual([]);
  });
});

describe("the product block in a blog document", () => {
  it("validates as part of the block union", () => {
    const block = { type: "product", slug: "fritzbox-7590-ax", variant: "card" };
    expect(BlogBlockSchema.parse(block)).toEqual(block);
    expect(BlogDocumentSchema.parse({ version: 1, blocks: [block] }).blocks).toHaveLength(1);
  });

  it("rejects a variant the renderer has no branch for", () => {
    expect(() =>
      BlogBlockSchema.parse({ type: "product", slug: "x", variant: "carousel" }),
    ).toThrow();
  });

  it("is offered in the editor's slash menu, gated on the shop integration", () => {
    // The catalog entry is what makes the block reachable at all — the schema
    // alone would let it validate while no editor could ever insert one.
    const entry = BLOG_BLOCKS.find((b) => b.id === "product");
    expect(entry).toBeDefined();
    expect(entry?.integration).toBe("shop");
    expect(entry?.group).toBe("embed");
    // The inserted template must itself be valid, or picking the command puts
    // an unparseable block into the document.
    expect(() => BlogBlockSchema.parse(entry!.block)).not.toThrow();
  });
});

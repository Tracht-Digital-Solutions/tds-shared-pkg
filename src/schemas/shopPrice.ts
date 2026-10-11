/**
 * The 24-hour price rules for TDShop offers, without zod (0.54).
 *
 * They used to live in `./shopBlocks` next to the schemas. `ProductCard` needs
 * `displayPrice`, and importing it from there put zod (85 KB) into the shared
 * component barrel — and Astro hydrates an island through its module's whole
 * namespace, so every page with a ThemeToggle shipped zod. `./shopBlocks`
 * re-exports everything here, so nothing else changes.
 */

/** The fields of an offer the price rules read. Structurally a `ShopOffer`. */
export interface PricedOffer {
  kind?: "own" | "affiliate";
  priceCents: number | null;
  priceCheckedAt: string | null;
  currency: string;
}

/**
 * How long a fetched affiliate price may be shown.
 *
 * Amazon's Product Advertising API licence requires that a displayed price
 * comes from the API, carries the time it was retrieved, and is not shown once
 * it is older than 24 hours. We apply the same ceiling to every network rather
 * than only to Amazon: a stale price is misleading regardless of who quoted it,
 * and one rule is one thing to get right.
 */
export const PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a quoted price is too old to display.
 *
 * Returns `true` for a never-checked offer as well: with no retrieval time we
 * cannot assert the price is current, and the honest rendering is the same one
 * a stale price gets. Callers that want to tell the two apart check
 * `priceCheckedAt === null` themselves — `ShopOffer.priceCheckedAt`
 * documents why they might.
 *
 * `now` is injectable so a renderer can pin it per page render; leaving three
 * sites to each call `Date.now()` mid-render is how one card in a grid
 * disagrees with its neighbour about what "24 hours" means.
 */
export function isPriceStale(
  offer: Pick<PricedOffer, "priceCheckedAt" | "priceCents">,
  now: number = Date.now(),
): boolean {
  if (offer.priceCents === null || offer.priceCheckedAt === null) return true;
  const checked = Date.parse(offer.priceCheckedAt);
  if (Number.isNaN(checked)) return true;
  return now - checked > PRICE_MAX_AGE_MS;
}

/**
 * The price to render, or `null` when it may not be shown.
 *
 * Exists so that no consumer has to remember to call {@link isPriceStale}
 * before reading `priceCents`. Forgetting that check is not a cosmetic bug —
 * it is the licence term that keeps the partner programme.
 */
export function displayPrice(
  offer: PricedOffer,
  now: number = Date.now(),
): { cents: number; currency: string } | null {
  // The 24-hour rule is about quoting SOMEBODY ELSE's price. An own offer's
  // price is ours to state, never expires, and the API therefore serves it
  // without `priceCheckedAt` — treating that as "never fetched" hid every
  // fixed price in the shop behind "Preis beim Anbieter prüfen".
  if (offer.kind === "own" && offer.priceCents !== null) {
    return { cents: offer.priceCents, currency: offer.currency };
  }
  if (isPriceStale(offer, now)) return null;
  return { cents: offer.priceCents as number, currency: offer.currency };
}

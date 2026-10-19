import type { CSSProperties } from "react";
import type { ImageAttributes } from './imageAttributes';

import type { ShopOffer, ShopProductRef } from "../schemas/shopBlocks";
// Never a value import from `../schemas/shopBlocks`: it loads zod, and this
// card is in the barrel every site hydrates (see `../schemas/shopPrice`).
import { displayPrice } from "../schemas/shopPrice";
import { formatPrice } from "../format";

/**
 * The one TDShop product card, rendered by all three surfaces: the shop itself,
 * an inline product block or article-end recommendation in the journal, and the
 * placement widget in the customer portal.
 *
 * ### Why this is shared rather than three cards
 *
 * Not to save markup — to make two things impossible to forget.
 *
 * 1. **The advertising label.** An affiliate offer must be recognisable as
 *    advertising (§ 5a UWG / § 6 TMG). If each surface rendered its own card,
 *    the label would be three decisions and one of them would eventually be
 *    "later". Here it is not a prop a caller may omit: `affiliateLabel` has a
 *    default, and the label element is emitted whenever an affiliate offer is
 *    present, regardless of what the caller passed. `AdSlot.astro` in the blog
 *    reached the same conclusion for AdSense units.
 * 2. **The stale price.** {@link displayPrice} returns `null` once a quote is
 *    older than 24 hours, and this card then shows "Preis beim Anbieter prüfen"
 *    instead of a number. A card that reads `offer.priceCents` directly would
 *    show yesterday's price forever — which is the term the Amazon partner
 *    programme is actually revoked over.
 *
 * ### What it deliberately does NOT do
 *
 * No fetching. The product arrives as a prop, because the three callers get it
 * three different ways (the shop from its own SSR load, the journal from a
 * fail-soft content fetch, the portal from `apiFetch`) and a component that
 * fetched would have to know about site keys.
 *
 * No click transport either — `onOfferClick` is a callback. The click endpoint
 * wants the caller's site key in the body, which this component has no business
 * holding.
 */

export interface ProductCardProps {
  image?: ImageAttributes;
  product: ShopProductRef;
  /** `card` = image + teaser + primary offer, `inline` = one row, `list` = card + every offer. */
  variant?: "card" | "inline" | "list";
  lang?: "de" | "en";
  /**
   * The advertising label. Overridable for wording, NOT for omission — passing
   * an empty string still renders the default, see the class note above.
   */
  affiliateLabel?: string;
  /** Pinned render clock, so every card in one grid ages a price identically. */
  now?: number;
  /** Fired before the browser follows an offer link. For the click beacon. */
  onOfferClick?: (offer: ShopOffer, product: ShopProductRef) => void;
  /**
   * The shop's own catalogue only: an own offer gets an add-to-basket button
   * (`data-add-to-cart`, wired by the page) as its filled button, and the
   * one-product checkout becomes the quiet "Direkt zur Kasse" link beside it.
   * Off everywhere else, because the basket lives on the shop's origin.
   */
  addToCart?: boolean;
  className?: string;
  style?: CSSProperties;
}

const TX = {
  de: {
    label: "Anzeige",
    checkPrice: "Preis beim Anbieter prüfen",
    at: "bei",
    asOf: "Stand",
    toOffer: "Zum Angebot",
    toProduct: "Ansehen",
    buy: "Kaufen",
    addToCart: "In den Warenkorb",
    buyNow: "Direkt zur Kasse",
    from: "ab",
    outOfStock: "Derzeit nicht verfügbar",
    amazonNote:
      "Preis und Verfügbarkeit können sich geändert haben. Maßgeblich ist der Preis, der zum Kaufzeitpunkt auf der Anbieterseite steht.",
  },
  en: {
    label: "Advertisement",
    checkPrice: "Check price at the merchant",
    at: "at",
    asOf: "as of",
    toOffer: "View offer",
    toProduct: "View",
    buy: "Buy",
    addToCart: "Add to basket",
    buyNow: "Buy now",
    from: "from",
    outOfStock: "Currently unavailable",
    amazonNote:
      "Price and availability may have changed. The price shown on the merchant's page at the time of purchase applies.",
  },
} as const;

function formatChecked(iso: string, lang: "de" | "en"): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(t));
}

/** The offer a card leads with: lowest `position`, own offers ahead of affiliate. */
function primaryOffer(offers: ShopOffer[]): ShopOffer | null {
  if (offers.length === 0) return null;
  const sorted = [...offers].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "own" ? -1 : 1;
    return a.position - b.position;
  });
  return sorted[0] ?? null;
}

function OfferRow({
  offer,
  product,
  lang,
  now,
  onOfferClick,
  addToCart = false,
}: {
  offer: ShopOffer;
  product: ShopProductRef;
  lang: "de" | "en";
  now: number;
  onOfferClick?: ProductCardProps["onOfferClick"];
  addToCart?: boolean;
}) {
  const tx = TX[lang];
  const price = displayPrice(offer, now);
  const affiliate = offer.kind === "affiliate";
  const toBasket = addToCart && !affiliate;

  // Info first, actions last: the button is the offer's final element and the
  // offer sits at the foot of the card, so every button in a grid row lines up
  // however long the teaser or the price notes above it run.
  return (
    <div className="tds-product-offer">
      <div className="tds-product-offer__info">
        <span className="tds-product-offer__merchant">
          {tx.at} {offer.merchant}
        </span>
        <span className="tds-product-price">
          {/* Our own offers are service packages: the price covers the hours the
              package names, and more work is billed on top (shop terms). So it
              is a starting price and says so. A partner's price is the
              merchant's and carries no prefix. */}
          {price && !affiliate ? <span className="tds-product-price__from">{tx.from} </span> : null}
          {price ? formatPrice(price.cents, price.currency, lang) : tx.checkPrice}
        </span>
        {price && offer.priceCheckedAt ? (
          <span className="tds-product-offer__asof">
            {tx.asOf} {formatChecked(offer.priceCheckedAt, lang)}
          </span>
        ) : null}
        {offer.availability === "out_of_stock" ? (
          <span className="tds-product-offer__stock">{tx.outOfStock}</span>
        ) : null}
      </div>
      <div className="tds-product-offer__actions">
        {toBasket ? (
          <>
            <button
              type="button"
              className="btn btn-primary tds-product-offer__cta"
              data-add-to-cart={product.slug}
              data-product-title={product.title}
            >
              {tx.addToCart}
            </button>
            <a className="tds-product-offer__direct" href={offer.url} onClick={() => onOfferClick?.(offer, product)}>
              {tx.buyNow}
            </a>
          </>
        ) : (
          <a
            className="btn btn-primary tds-product-offer__cta"
            href={offer.url}
            // `sponsored` is the correct value for paid/affiliate links and
            // `nofollow` keeps older crawlers honest; `noopener` closes the
            // window.opener hole on target=_blank.
            rel={affiliate ? "sponsored nofollow noopener" : "noopener"}
            target={affiliate ? "_blank" : undefined}
            onClick={() => onOfferClick?.(offer, product)}
          >
            {affiliate ? tx.toOffer : tx.buy}
          </a>
        )}
      </div>
    </div>
  );
}

export default function ProductCard({
  image,
  product,
  variant = "card",
  lang = "de",
  affiliateLabel,
  now = Date.now(),
  onOfferClick,
  addToCart = false,
  className,
  style,
}: ProductCardProps) {
  const tx = TX[lang];
  const offers = product.offers ?? [];
  const hasAffiliate = offers.some((o) => o.kind === "affiliate");
  const hasAmazon = offers.some((o) => o.network === "amazon");
  // Overridable wording, not an opt-out: an empty or whitespace-only label
  // falls back rather than rendering nothing. See the class doc comment.
  const label = affiliateLabel?.trim() || tx.label;
  const primary = primaryOffer(offers);

  const classes = ["tds-product-card", `tds-product-card--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  if (variant === "inline") {
    return (
      <div className={classes} style={style}>
        {hasAffiliate ? <span className="tds-product-badge">{label}</span> : null}
        <a className="tds-product-card__title" href={product.url}>
          {product.title}
        </a>
        {primary ? (
          <OfferRow
            offer={primary}
            product={product}
            lang={lang}
            now={now}
            onOfferClick={onOfferClick}
            addToCart={addToCart}
          />
        ) : null}
      </div>
    );
  }

  return (
    <article className={classes} style={style}>
      {hasAffiliate ? <span className="tds-product-badge">{label}</span> : null}

      {product.imageUrl ? (
        <a className="tds-product-card__media" href={product.url}>
          {/* Amazon requires their own image URLs be served, not copies —
              hence a plain <img> against the remote host rather than any
              local optimisation pipeline. */}
          <img src={product.imageUrl} alt={image?.alt ?? product.title} loading="lazy" decoding="async" {...image} />
        </a>
      ) : null}

      <div className="tds-product-card__body">
        <a className="tds-product-card__title" href={product.url}>
          {product.title}
        </a>
        <p className="tds-product-card__teaser">{product.teaser}</p>
      </div>

      {/* The buying block is pushed to the card's foot (`margin-top: auto`),
          so cards of one grid row put their buttons on one line. The Amazon
          note sits above the offer for the same reason: under it, it would
          lift that card's button above its neighbours'. */}
      <div className="tds-product-card__buy">
        {hasAmazon ? <p className="tds-affiliate-note">{tx.amazonNote}</p> : null}
        {variant === "list" ? (
          offers.map((offer) => (
            <OfferRow
              key={offer.id}
              offer={offer}
              product={product}
              lang={lang}
              now={now}
              onOfferClick={onOfferClick}
              addToCart={addToCart}
            />
          ))
        ) : primary ? (
          <OfferRow
            offer={primary}
            product={product}
            lang={lang}
            now={now}
            onOfferClick={onOfferClick}
            addToCart={addToCart}
          />
        ) : (
          <a className="btn btn-ghost" href={product.url}>
            {tx.toProduct}
          </a>
        )}
      </div>
    </article>
  );
}

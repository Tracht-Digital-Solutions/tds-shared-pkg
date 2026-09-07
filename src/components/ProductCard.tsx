import type { CSSProperties } from "react";

import {
  displayPrice,
  type ShopOffer,
  type ShopProductRef,
} from "../schemas/shopBlocks";

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
    outOfStock: "Currently unavailable",
    amazonNote:
      "Price and availability may have changed. The price shown on the merchant's page at the time of purchase applies.",
  },
} as const;

function formatPrice(cents: number, currency: string, lang: "de" | "en"): string {
  try {
    return new Intl.NumberFormat(lang === "de" ? "de-DE" : "en-GB", {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    // An unknown currency code must not take the card down with it.
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

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
}: {
  offer: ShopOffer;
  product: ShopProductRef;
  lang: "de" | "en";
  now: number;
  onOfferClick?: ProductCardProps["onOfferClick"];
}) {
  const tx = TX[lang];
  const price = displayPrice(offer, now);
  const affiliate = offer.kind === "affiliate";

  return (
    <div className="tds-product-offer">
      <span className="tds-product-offer__merchant">
        {tx.at} {offer.merchant}
      </span>
      <span className="tds-product-price">
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
    </div>
  );
}

export default function ProductCard({
  product,
  variant = "card",
  lang = "de",
  affiliateLabel,
  now = Date.now(),
  onOfferClick,
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
          <img src={product.imageUrl} alt={product.title} loading="lazy" />
        </a>
      ) : null}

      <div className="tds-product-card__body">
        <a className="tds-product-card__title" href={product.url}>
          {product.title}
        </a>
        <p className="tds-product-card__teaser">{product.teaser}</p>

        {variant === "list" ? (
          offers.map((offer) => (
            <OfferRow
              key={offer.id}
              offer={offer}
              product={product}
              lang={lang}
              now={now}
              onOfferClick={onOfferClick}
            />
          ))
        ) : primary ? (
          <OfferRow
            offer={primary}
            product={product}
            lang={lang}
            now={now}
            onOfferClick={onOfferClick}
          />
        ) : (
          <a className="btn btn-ghost" href={product.url}>
            {tx.toProduct}
          </a>
        )}

        {hasAmazon ? <p className="tds-affiliate-note">{tx.amazonNote}</p> : null}
      </div>
    </article>
  );
}

/**
 * The four public TDS properties, in the order every public header lists them.
 *
 * ### Why this is shared
 *
 * The journal, the tools site and the shop each carried their own list of
 * sibling links, and the three disagreed: the tools site called the journal
 * "Blog" and the main site "Startseite", the shop called them "Journal" and
 * "Tracht Digital", the journal listed no main site at all, and the order
 * differed on every one. Following a link from one to the next renamed the
 * links under the reader's cursor. This is the one list; each header adds only
 * what is its own (the journal's "Entdecken", the shop's basket) and marks
 * itself as current.
 *
 * The names are proper names and stay the same in both languages — "Shop"
 * translated to "Store" would name a site that does not exist. Sibling links
 * are absolute (they cross origins) and keep the reader's language. The current
 * property links to its own home, which the header passes in (`/` or `/en/`,
 * relative, so a preview deployment stays on itself).
 */

export type PublicProperty = "journal" | "tools" | "shop" | "main";

export interface PropertyLink {
  key: PublicProperty;
  label: string;
  href: string;
  /** The property this header belongs to. */
  current: boolean;
}

/** Canonical origins, without a trailing slash. */
export const PROPERTY_ORIGINS: Readonly<Record<PublicProperty, string>> = {
  journal: "https://blog.tracht-digital.de",
  tools: "https://tools.tracht-digital.de",
  shop: "https://shop.tracht-digital.de",
  main: "https://tracht-digital.de",
};

const LABELS: Readonly<Record<PublicProperty, string>> = {
  journal: "Journal",
  tools: "Tools",
  shop: "Shop",
  main: "Tracht Digital",
};

const ORDER: readonly PublicProperty[] = ["journal", "tools", "shop", "main"];

/** A property's home page in the given language. */
export function propertyHome(key: PublicProperty, lang: "de" | "en"): string {
  return `${PROPERTY_ORIGINS[key]}${lang === "en" ? "/en/" : "/"}`;
}

/**
 * Where every property bar's contact CTA points: the main site's contact
 * section, in the reader's language. One address for the three bars — the
 * journal and the tools site both sent an English reader to the German page.
 */
export function propertyContact(lang: "de" | "en"): string {
  return `${propertyHome("main", lang)}#contact`;
}

/**
 * The property links for one header.
 *
 * @param current  the property rendering this header
 * @param lang     the page language; sibling links keep it
 * @param homeHref the current property's own home, e.g. `/` or `/en/`
 */
export function propertyNav(
  current: Exclude<PublicProperty, "main">,
  lang: "de" | "en",
  homeHref: string,
): PropertyLink[] {
  return ORDER.map((key) => ({
    key,
    label: LABELS[key],
    href: key === current ? homeHref : propertyHome(key, lang),
    current: key === current,
  }));
}

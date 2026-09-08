import { translations, type Language } from "../i18n/translations";
import { openConsentSettings } from "./store";

export interface ConsentLinkProps {
  lang?: Language;
  /** Extra classes, so a footer can match it to its own link styling. */
  className?: string;
}

/**
 * The "Cookie-Einstellungen" entry point for a footer.
 *
 * This is not decoration. Art. 7 Abs. 3 DSGVO requires that withdrawing a
 * consent be as easy as giving it, and a banner that appears once and never
 * again leaves no route back — so every page that can show the banner needs
 * this beside its imprint and privacy links.
 *
 * A `<button>`, not an `<a>`: it performs an action on this page rather than
 * navigating anywhere. Styled as a link so it reads as one, which is a look,
 * not a reason to lie to the accessibility tree about what it does.
 *
 * Works with no banner mounted (the dispatch is a no-op), so a page can render
 * it unconditionally.
 */
export default function ConsentLink({ lang = "de", className }: ConsentLinkProps = {}) {
  return (
    <button
      type="button"
      className={className ? `consent-link ${className}` : "consent-link"}
      onClick={openConsentSettings}
    >
      {translations[lang].consent.manage}
    </button>
  );
}

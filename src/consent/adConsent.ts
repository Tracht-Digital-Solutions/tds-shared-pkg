/**
 * The advertising-consent bus.
 *
 * This used to live inside `components/CookieNotice.tsx`. It moved here when
 * the consent manager arrived, for one reason: `store.ts` has to keep writing
 * it, and a store importing a React component file to reach a localStorage
 * helper is backwards. `CookieNotice` re-exports these names, so
 * `@tracht-digital-solutions/tds-shared/components` still resolves every one
 * of them and no consumer had to change.
 *
 * WHY IT SURVIVES AT ALL. The blog's AdSense loader
 * (`tds-blog-frontend/src/layouts/Layout.astro`) injects `adsbygoogle.js` only
 * after reading `tds-ad-consent === "granted"` or hearing this event. That code
 * ships on a live site and is not released in lockstep with this package, so
 * the key and the event name are a CONTRACT, not an implementation detail. The
 * category model writes through to them (see `store.ts`) rather than replacing
 * them.
 */

/** localStorage key holding the advertising-consent choice (consent mode). */
export const AD_CONSENT_KEY = "tds-ad-consent";
/** Window event fired when the ad-consent choice changes, so ad loaders can
 *  react without a page reload. `detail` is the new value. */
export const AD_CONSENT_EVENT = "tds-ad-consent";
export type AdConsent = "granted" | "denied" | null;

/** Read the stored advertising-consent choice (null = undecided). SSR-safe. */
export function getAdConsent(): AdConsent {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(AD_CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

/** Persist the advertising-consent choice and notify listeners (the blog's ad
 *  loader listens for {@link AD_CONSENT_EVENT}). */
export function setAdConsent(value: "granted" | "denied"): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AD_CONSENT_KEY, value);
  } catch {
    /* private mode — the choice won't persist across visits */
  }
  try {
    window.dispatchEvent(new CustomEvent(AD_CONSENT_EVENT, { detail: value }));
  } catch {
    /* ignore */
  }
}

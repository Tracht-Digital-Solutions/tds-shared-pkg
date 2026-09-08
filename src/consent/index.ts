/**
 * The consent manager. Import from
 * `@tracht-digital-solutions/tds-shared/consent`.
 *
 * Four pieces and a store:
 *
 *   ConsentBanner       first layer — a fixed region, NOT a modal
 *   ConsentSettings     second layer — a native <dialog>, one switch per purpose
 *   ConsentLink         the footer's way back in (Art. 7 Abs. 3 DSGVO)
 *   ConsentPlaceholder  click-to-load gate in front of a third-party embed
 *   store               readConsent / writeConsent / consentGranted / events
 *
 * A page mounts the banner once (it renders the dialog itself), puts the link
 * in its footer, and wraps every third-party embed in a placeholder. Anything
 * non-React — an inline script deciding whether to inject a tag — reads
 * `consentGranted(category)` and listens for `CONSENT_EVENT`.
 *
 * The old `components/CookieNotice` still exists and still works; it is the
 * informational-only predecessor. New call sites use `ConsentBanner`, which
 * covers the informational case too (pass no `categories`).
 */

export { default as ConsentBanner } from "./ConsentBanner";
export type { ConsentBannerProps } from "./ConsentBanner";

export { default as ConsentSettings } from "./ConsentSettings";
export type { ConsentSettingsProps } from "./ConsentSettings";

export { default as ConsentLink } from "./ConsentLink";
export type { ConsentLinkProps } from "./ConsentLink";

export { default as ConsentPlaceholder } from "./ConsentPlaceholder";
export type { ConsentPlaceholderProps } from "./ConsentPlaceholder";

export { useConsent } from "./useConsent";

export {
  CONSENT_CATEGORIES,
  CONSENT_VERSION,
  OPTIONAL_CATEGORIES,
  allGranted,
  isConsentCategory,
  necessaryOnly,
  type ConsentCategory,
  type ConsentChoices,
  type ConsentRecord,
  type OptionalCategory,
} from "./categories";

export {
  CONSENT_EVENT,
  CONSENT_KEY,
  CONSENT_OPEN_EVENT,
  acceptAll,
  clearConsent,
  consentGranted,
  onConsentChange,
  openConsentSettings,
  readConsent,
  rejectAll,
  writeConsent,
} from "./store";

/* The legacy advertising-consent bus. Re-exported here because the store
   writes through to it and a consumer reasoning about consent should find it
   in one place — `components` also still exports it, unchanged. */
export {
  AD_CONSENT_EVENT,
  AD_CONSENT_KEY,
  getAdConsent,
  setAdConsent,
  type AdConsent,
} from "./adConsent";

import { useEffect, useRef, useState } from "react";
import { translations, type Language } from "../i18n/translations";

const DEFAULT_STORAGE_KEY = "tds-cookie-notice";
const DEFAULT_PRIVACY_URL = "https://tracht-digital.de/legal/datenschutz";

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

export interface CookieNoticeProps {
  /** UI language for the notice copy. Defaults to German. */
  lang?: Language;
  /**
   * Wording variant:
   * - `"site"` (default): public marketing/blog wording — no tracking
   *   cookies, only local browser storage (theme/language preference).
   * - `"panel"`: dashboard wording — a technically necessary session
   *   cookie is set on login (admin panel, customer portal).
   */
  variant?: "site" | "panel";
  /**
   * When true, the notice becomes an advertising-consent **gate** (Akzeptieren /
   * Ablehnen) instead of the one-time informational notice — used on the blog
   * when AdSense is enabled. The choice is stored under `tds-ad-consent` (see
   * {@link getAdConsent}) and gates whether the ad loader runs. Default false.
   */
  consent?: boolean;
  /** Link target for the privacy-policy line. Absolute by default so the
   *  panels (other subdomains) resolve it correctly; the landingpage can
   *  pass its local `/legal/datenschutz` path. */
  privacyUrl?: string;
  /** localStorage key that remembers the informational dismissal (per origin). */
  storageKey?: string;
}

/**
 * Cookie / privacy notice shown once per browser (per origin).
 *
 * Two modes:
 * - **Informational** (default): the TDS properties set no consent-requiring
 *   cookies, so this states that fact, links the privacy policy and disappears
 *   for good once acknowledged (persisted under `storageKey`).
 * - **Consent** (`consent`): a real opt-in gate for advertising cookies (blog
 *   with AdSense on). Two buttons store `granted`/`denied` under
 *   `tds-ad-consent`; the blog only loads `adsbygoogle.js` after `granted`.
 *
 * Nothing renders until the mount effect has read localStorage, so returning
 * visitors never see a flash. Styling ships as the `.cookie-notice` block in
 * `styles/base.css` (base, not app.css, because the landingpage imports only
 * the base stylesheet).
 */
export default function CookieNotice({
  lang = "de",
  variant = "site",
  consent = false,
  privacyUrl = DEFAULT_PRIVACY_URL,
  storageKey = DEFAULT_STORAGE_KEY,
}: CookieNoticeProps = {}) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      if (consent) {
        if (getAdConsent() !== null) return; // already decided
      } else if (localStorage.getItem(storageKey) === "1") {
        return;
      }
    } catch {
      // Storage disabled — show the notice; the choice won't persist.
    }
    setVisible(true);
  }, [consent, storageKey]);

  /**
   * Publish the space this notice occupies at the bottom of the viewport, so
   * other fixed bottom chrome can sit ABOVE it instead of on top of it — today
   * that is the toast stack (`.tds-toast-host` in base.css reads
   * `--tds-bottom-lane`). Measured rather than guessed: the notice is one line
   * on a wide screen and four on a phone, so any hard-coded offset is wrong on
   * one of them (it was, on both). Cleared on unmount/dismissal, so the lane
   * exists only while something is actually in it.
   */
  useEffect(() => {
    const el = ref.current;
    if (!visible || !el || typeof window === "undefined") return;
    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty("--tds-bottom-lane", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    };
    publish();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(publish) : null;
    ro?.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty("--tds-bottom-lane");
    };
  }, [visible]);

  if (!visible) return null;

  const t = translations[lang].cookieNotice;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // Private mode / storage blocked — session-only dismissal.
    }
  };

  const decide = (value: "granted" | "denied") => {
    setVisible(false);
    setAdConsent(value);
  };

  return (
    <aside ref={ref} className="cookie-notice" role="region" aria-label={t.label}>
      <p className="cookie-notice-text">
        {consent ? t.consentText : variant === "panel" ? t.panelText : t.siteText}{" "}
        <a className="cookie-notice-link" href={privacyUrl}>
          {t.privacy}
        </a>
      </p>
      {consent ? (
        <div className="cookie-notice-actions">
          <button
            type="button"
            className="cookie-notice-btn cookie-notice-btn--ghost"
            onClick={() => decide("denied")}
          >
            {t.consentDecline}
          </button>
          <button
            type="button"
            className="cookie-notice-btn"
            onClick={() => decide("granted")}
          >
            {t.consentAccept}
          </button>
        </div>
      ) : (
        <button type="button" className="cookie-notice-btn" onClick={dismiss}>
          {t.accept}
        </button>
      )}
    </aside>
  );
}

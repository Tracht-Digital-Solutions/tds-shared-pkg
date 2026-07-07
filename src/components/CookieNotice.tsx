import { useEffect, useState } from "react";
import { translations, type Language } from "../i18n/translations";

const DEFAULT_STORAGE_KEY = "tds-cookie-notice";
const DEFAULT_PRIVACY_URL = "https://tracht-digital.de/legal/datenschutz";

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
  /** Link target for the privacy-policy line. Absolute by default so the
   *  panels (other subdomains) resolve it correctly; the landingpage can
   *  pass its local `/legal/datenschutz` path. */
  privacyUrl?: string;
  /** localStorage key that remembers the dismissal (per origin). */
  storageKey?: string;
}

/**
 * Dismissible cookie / privacy notice shown once per browser (per origin).
 *
 * The TDS properties set no consent-requiring cookies — the public sites
 * keep only local preferences (theme) in localStorage and the panels use
 * one technically necessary session cookie — so this banner is purely
 * informational: it states that fact, links the privacy policy and
 * disappears for good once acknowledged. Dismissal is persisted in
 * localStorage; when storage is unavailable (private mode) the dismissal
 * lasts for the page's lifetime and the banner returns on the next visit.
 *
 * Nothing renders until the mount effect has read localStorage, so
 * returning visitors never see the banner flash. Styling ships as the
 * `.cookie-notice` block in `styles/base.css` (base, not app.css, because
 * the landingpage imports only the base stylesheet).
 */
export default function CookieNotice({
  lang = "de",
  variant = "site",
  privacyUrl = DEFAULT_PRIVACY_URL,
  storageKey = DEFAULT_STORAGE_KEY,
}: CookieNoticeProps = {}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === "1") return;
    } catch {
      // Storage disabled — show the notice; dismissal won't persist.
    }
    setVisible(true);
  }, [storageKey]);

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

  return (
    <aside className="cookie-notice" role="region" aria-label={t.label}>
      <p className="cookie-notice-text">
        {variant === "panel" ? t.panelText : t.siteText}{" "}
        <a className="cookie-notice-link" href={privacyUrl}>
          {t.privacy}
        </a>
      </p>
      <button type="button" className="cookie-notice-btn" onClick={dismiss}>
        {t.accept}
      </button>
    </aside>
  );
}

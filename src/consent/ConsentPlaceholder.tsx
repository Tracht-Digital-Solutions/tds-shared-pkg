import { useState, type ReactNode } from "react";
import { translations, type Language } from "../i18n/translations";
import type { ConsentCategory } from "./categories";
import { openConsentSettings } from "./store";
import { useConsent } from "./useConsent";

export interface ConsentPlaceholderProps {
  /** The purpose this embed falls under — `marketing` for most third parties. */
  category: ConsentCategory;
  /** Who receives the request. Shown to the visitor, so use the name they'd recognise. */
  provider: string;
  lang?: Language;
  /**
   * The embed itself, as a THUNK. Not a plain element: React evaluates a
   * `children` expression at the call site whether or not this component
   * renders it, and for an `<iframe>` that is only half the problem — the
   * element would be created but not mounted, so no request fires. The thunk
   * exists for the other half: a caller that builds a `<script>` tag, calls an
   * SDK, or reads `window` while constructing the child would do all of that
   * before consent. Deferring the whole construction is the only version that
   * holds for every kind of embed.
   */
  children: () => ReactNode;
}

/**
 * Click-to-load gate in front of a third-party embed.
 *
 * The point is the ORDER of events. A YouTube or Vimeo iframe contacts its
 * origin the moment it mounts — before any banner is answered, and regardless
 * of what the privacy policy says. `youtube-nocookie.com` narrows what is
 * stored; it does not stop the connection, and the visitor's IP address has
 * already gone. So the embed must not exist until there is a consent.
 *
 * Two ways past it, and they are different in kind:
 *
 *  - **"Inhalt laden"** loads this one embed, now. That click is itself a
 *    specific, informed consent for this element (the recipient is named right
 *    above the button), and it is deliberately NOT written to storage: the
 *    visitor agreed to one video, not to a standing permission.
 *  - **"Dauerhaft entscheiden"** opens the settings dialog, where a standing
 *    consent for the whole category can be given — and taken back.
 *
 * Once the category is consented to, this renders the embed directly and gets
 * out of the way.
 */
export default function ConsentPlaceholder({
  category,
  provider,
  lang = "de",
  children,
}: ConsentPlaceholderProps) {
  const granted = useConsent(category);
  const [once, setOnce] = useState(false);
  const t = translations[lang].consent.placeholder;

  if (granted || once) return <>{children()}</>;

  return (
    <div className="consent-placeholder">
      <p className="consent-placeholder__title">{t.title}</p>
      <p className="consent-placeholder__body">{t.body.replaceAll("{provider}", provider)}</p>
      <div className="consent-placeholder__actions">
        <button type="button" className="btn btn-primary" onClick={() => setOnce(true)}>
          {t.load}
        </button>
        <button type="button" className="btn btn-ghost" onClick={openConsentSettings}>
          {t.settings}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { mountConsentBanner } from "../dom/consent.js";
import type { Language } from "../i18n/translations";
import type { OptionalCategory } from "./categories";

export interface ConsentBannerProps {
  /** UI language. Defaults to German. */
  lang?: Language;
  /**
   * The optional purposes this site actually uses, in display order.
   *
   * **Empty (the default) is a supported and common case**, not a
   * misconfiguration: most TDS properties set nothing beyond what they cannot
   * work without. The banner then states that fact and offers one
   * acknowledgement instead of asking a question with no content — soliciting
   * a consent you do not need is its own dark pattern, and it teaches people
   * to click the first button on every site they visit.
   */
  categories?: readonly OptionalCategory[];
  /**
   * Wording of the informational variant (only used when `categories` is
   * empty): `"site"` for the public properties, `"panel"` where a technically
   * necessary session cookie is set on login.
   */
  variant?: "site" | "panel";
  /** Link target for the privacy policy. Pass the LOCAL path where one exists. */
  privacyUrl?: string;
  /** Optional imprint link, shown beside the privacy link in the dialog. */
  imprintUrl?: string;
}

const DEFAULT_PRIVACY_URL = "https://tracht-digital.de/legal/datenschutz";

/**
 * The consent manager's first layer.
 *
 * **Not a modal, deliberately.** A dialog with a backdrop would make the
 * imprint and the privacy policy unreachable until the visitor answers, and a
 * banner that blocks the very pages it points at is itself the defect — the
 * information a decision requires has to stay reachable while the decision is
 * pending. So: a fixed region, page scrolling intact, every link on the page
 * still clickable. The SECOND layer (`ConsentSettings`) is a real dialog,
 * because by then the visitor asked for it.
 *
 * **The two DECISIONS are visually identical.** "Alle akzeptieren" and "Nur
 * notwendige" carry the same class, the same size and the same fill.
 * "Einstellungen" is the quieter one, and may be, because it decides nothing —
 * it opens a second layer. Refusing has to be no harder than agreeing (Art. 7
 * Abs. 3 DSGVO and the DSK's telemedia guidance), and a filled accept beside
 * an outlined reject is the single most frequently criticised construction in
 * German consent-banner enforcement. If you restyle these, keep the two
 * decisions equal.
 *
 * **Nothing is stored before an answer.** No cookie, no localStorage write, no
 * third-party request. `readConsent()` returning null — including because
 * storage throws — means undecided, and undecided means nothing optional runs.
 *
 * Nothing renders until the mount effect has read storage, so a returning
 * visitor never sees a flash of a banner they already dismissed.
 *
 * **One implementation (0.64.13).** This component is a thin React host for
 * `mountConsentBanner` (`src/dom/consent.ts`): the markup, the decisions,
 * the settings dialog and the bottom lane all live there, so the React and
 * the plain-DOM banner can no longer drift. Change behaviour there.
 */
export default function ConsentBanner({
  lang = "de",
  categories = [],
  variant = "site",
  privacyUrl = DEFAULT_PRIVACY_URL,
  imprintUrl,
}: ConsentBannerProps = {}) {
  const host = useRef<HTMLSpanElement>(null);
  // The options are read once, like the island's props: a consent banner
  // does not change its purposes while the page is open.
  const key = `${lang}|${categories.join(",")}|${variant}|${privacyUrl}|${imprintUrl ?? ""}`;
  useEffect(() => {
    if (!host.current) return;
    return mountConsentBanner({
      host: host.current,
      lang,
      categories,
      variant,
      privacyUrl,
      imprintUrl,
      // The island already waited for idle (`client:when="consent"`/`client:idle`).
      immediate: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // `display: contents`: the banner and dialog keep their own fixed position.
  return <span ref={host} style={{ display: "contents" }} />;
}

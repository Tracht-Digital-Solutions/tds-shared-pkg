import { useCallback, useEffect, useRef, useState } from "react";
import { translations, type Language } from "../i18n/translations";
import ConsentSettings from "./ConsentSettings";
import {
  necessaryOnly,
  type ConsentChoices,
  type OptionalCategory,
} from "./categories";
import {
  CONSENT_OPEN_EVENT,
  readConsent,
  writeConsent,
} from "./store";

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
 */
export default function ConsentBanner({
  lang = "de",
  categories = [],
  variant = "site",
  privacyUrl = DEFAULT_PRIVACY_URL,
  imprintUrl,
}: ConsentBannerProps = {}) {
  const t = translations[lang].consent;
  const notice = translations[lang].cookieNotice;
  const asks = categories.length > 0;

  const [decided, setDecided] = useState<boolean | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [initial, setInitial] = useState<ConsentChoices>(necessaryOnly);
  const ref = useRef<HTMLElement>(null);
  const focused = useRef(false);

  useEffect(() => {
    const record = readConsent();
    if (record) setInitial(record.choices);
    setDecided(record !== null);
  }, []);

  // The footer's "Cookie-Einstellungen" and any in-text link reach us through a
  // window event, because they are separate Astro islands with their own React
  // roots — there is no shared provider to hang state on.
  useEffect(() => {
    const open = () => {
      setInitial(readConsent()?.choices ?? necessaryOnly());
      setSettingsOpen(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, []);

  const visible = decided === false;

  /**
   * Publish the height this banner occupies, so the toast stack and the chat
   * launcher sit above it rather than on it (`--tds-bottom-lane`, read by
   * `.tds-toast-host` in base.css). Measured, not guessed: the banner is one
   * line on a wide screen and four on a phone.
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

  /**
   * Move focus to the banner once, and only when there is a real question.
   *
   * The tradeoff, stated plainly: an unannounced focus move on load is
   * normally something to avoid. Here the alternative is worse — a
   * screen-reader user would otherwise work down a page while a pending
   * decision about their data sits silently at the bottom of it, and the
   * banner is not in the reading order near the top. Three keystrokes dismiss
   * it either way.
   *
   * The informational variant does NOT take focus: interrupting someone to
   * tell them nothing is being collected buys nothing.
   */
  useEffect(() => {
    if (!visible || !asks || focused.current) return;
    focused.current = true;
    ref.current?.focus();
  }, [visible, asks]);

  const save = useCallback(
    (choices: ConsentChoices) => {
      writeConsent(choices, lang);
      setInitial(choices);
      setSettingsOpen(false);
      setDecided(true);
    },
    [lang],
  );

  return (
    <>
      {visible ? (
        <aside
          ref={ref}
          className="cookie-notice"
          role="region"
          aria-label={asks ? t.label : notice.label}
          tabIndex={-1}
        >
          <p className="cookie-notice-text">
            {asks ? t.intro : variant === "panel" ? notice.panelText : notice.siteText}{" "}
            <a className="cookie-notice-link" href={privacyUrl}>
              {asks ? t.privacy : notice.privacy}
            </a>
          </p>
          {asks ? (
            <div className="cookie-notice-actions">
              <button
                type="button"
                className="cookie-notice-btn cookie-notice-btn--ghost"
                onClick={() => setSettingsOpen(true)}
              >
                {t.settings}
              </button>
              {/* Same class as "Alle akzeptieren" below, and that is the
                  point: the two DECISIONS look identical. Only "Einstellungen"
                  above is quieter, because it decides nothing — it opens a
                  second layer. A filled accept beside an outlined reject is
                  the single most frequently criticised construction in German
                  consent-banner enforcement; do not reintroduce it. */}
              <button
                type="button"
                className="cookie-notice-btn"
                onClick={() => save(necessaryOnly())}
              >
                {t.necessaryOnly}
              </button>
              <button
                type="button"
                className="cookie-notice-btn"
                onClick={() => save({ necessary: true, functional: true, analytics: true, marketing: true })}
              >
                {t.acceptAll}
              </button>
            </div>
          ) : (
            <button type="button" className="cookie-notice-btn" onClick={() => save(necessaryOnly())}>
              {notice.accept}
            </button>
          )}
        </aside>
      ) : null}

      <ConsentSettings
        open={settingsOpen}
        lang={lang}
        categories={categories}
        initial={initial}
        privacyUrl={privacyUrl}
        imprintUrl={imprintUrl}
        onSave={save}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}

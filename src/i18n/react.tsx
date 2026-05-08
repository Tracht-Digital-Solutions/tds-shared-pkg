/**
 * React-only i18n entry: provider + hook backed by the translations
 * data. Persist the chosen language in `localStorage` under "tdsLang"
 * and keep `<html lang>` in sync.
 *
 * Import from `@tracht-digital-solutions/tds-shared/i18n/react`. The
 * Astro frontends use this from their React islands (`client:load` /
 * `client:visible`).
 *
 * ### Cross-island sync
 *
 * Astro mounts each `client:*` island as a separate React tree, so a
 * page with multiple islands has multiple independent
 * `LanguageProvider` instances. To keep them in lockstep, `setLang`
 * dispatches a `tds:lang-change` `CustomEvent` on `window`, and every
 * provider listens for it and mirrors the new language into its
 * local state. Same-tab `localStorage` mutations don't fire `storage`
 * events, so the custom event is the only viable bus.
 *
 * The event is fire-and-forget: providers that share the same
 * already-set language no-op, so the broadcast is safe to dispatch
 * unconditionally. Other contexts (vanilla JS, tests) can dispatch
 * the same event to drive providers without going through React.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { translations, type Language, type Translations } from "./translations";

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const LANG_CHANGE_EVENT = "tds:lang-change";

function isLanguage(value: string): value is Language {
  return value in translations;
}

export function LanguageProvider({
  children,
  initialLang = "de",
}: {
  children: ReactNode;
  initialLang?: Language;
}) {
  const [lang, setLangState] = useState<Language>(initialLang);

  useEffect(() => {
    const stored =
      typeof window !== "undefined" ? localStorage.getItem("tdsLang") : null;
    if (stored && isLanguage(stored)) setLangState(stored);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onLangChange = (e: Event) => {
      const detail = (e as CustomEvent<Language>).detail;
      if (detail && isLanguage(detail)) {
        setLangState((prev) => (prev === detail ? prev : detail));
      }
    };
    window.addEventListener(LANG_CHANGE_EVENT, onLangChange);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, onLangChange);
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("tdsLang", newLang);
      window.dispatchEvent(
        new CustomEvent<Language>(LANG_CHANGE_EVENT, { detail: newLang }),
      );
    }
  };

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const value: LanguageContextValue = {
    lang,
    setLang,
    t: translations[lang] as Translations,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLang must be used within <LanguageProvider>");
  }
  return ctx;
}

/**
 * React-only i18n entry: provider + hook backed by the translations
 * data. Persist the chosen language in `localStorage` under "tdsLang"
 * and keep `<html lang>` in sync.
 *
 * Import from `@tracht-digital-solutions/tds-shared/i18n/react`. The
 * Astro frontends use this from their React islands (`client:load` /
 * `client:visible`).
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

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("tdsLang", newLang);
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

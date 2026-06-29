// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { LanguageProvider, useLang } from "../i18n/react";
import { translations } from "../i18n/translations";

/**
 * The i18n React provider drives the language toggle across every island.
 * Its contract: hydrate from localStorage, persist + broadcast on change,
 * mirror a cross-island `tds:lang-change` event, and keep `<html lang>`
 * in sync. The toggle was once a no-op because an island read the wrong
 * source — these tests pin the behaviour that prevents a regression.
 */
function wrapper({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = "";
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("useLang", () => {
  it("throws when used outside a provider", () => {
    expect(() => renderHook(() => useLang())).toThrow(/within <LanguageProvider>/);
  });

  it("defaults to German and exposes its translation bundle", () => {
    const { result } = renderHook(() => useLang(), { wrapper });
    expect(result.current.lang).toBe("de");
    expect(result.current.t).toBe(translations.de);
  });

  it("hydrates the language from localStorage on mount", () => {
    localStorage.setItem("tdsLang", "en");
    const { result } = renderHook(() => useLang(), { wrapper });
    expect(result.current.lang).toBe("en");
    expect(result.current.t).toBe(translations.en);
  });

  it("ignores an unknown stored language", () => {
    localStorage.setItem("tdsLang", "fr");
    const { result } = renderHook(() => useLang(), { wrapper });
    expect(result.current.lang).toBe("de");
  });

  it("persists, mirrors to <html lang>, and broadcasts on setLang", () => {
    const { result } = renderHook(() => useLang(), { wrapper });
    act(() => result.current.setLang("en"));
    expect(result.current.lang).toBe("en");
    expect(localStorage.getItem("tdsLang")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("LanguageProvider cross-island sync", () => {
  it("mirrors a tds:lang-change event from another island", () => {
    const { result } = renderHook(() => useLang(), { wrapper });
    expect(result.current.lang).toBe("de");
    act(() => {
      window.dispatchEvent(
        new CustomEvent("tds:lang-change", { detail: "en" }),
      );
    });
    expect(result.current.lang).toBe("en");
  });

  it("ignores a tds:lang-change carrying an unknown language", () => {
    const { result } = renderHook(() => useLang(), { wrapper });
    act(() => {
      window.dispatchEvent(
        new CustomEvent("tds:lang-change", { detail: "fr" }),
      );
    });
    expect(result.current.lang).toBe("de");
  });

  it("renders children with the active bundle", () => {
    function Probe() {
      const { t } = useLang();
      return <span>{t.nav.contact}</span>;
    }
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByText(translations.de.nav.contact)).toBeDefined();
  });
});

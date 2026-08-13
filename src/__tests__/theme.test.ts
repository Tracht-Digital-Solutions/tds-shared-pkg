// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  THEME_ATTRIBUTE,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemeChangeDetail,
} from "../design";
import {
  applyThemePreference,
  currentTheme,
  onThemeChange,
  readThemePreference,
  resolveTheme,
  startSystemThemeSync,
  systemTheme,
} from "../theme";

/**
 * The theme is stored in THREE places that must agree — localStorage (the
 * pre-paint cache the no-flash bootstrap reads), `<html data-theme>` (what
 * base.css selects on) and, for a logged-in user, the server. Every failure
 * here is silent in a browser: a wrong storage value just means the next
 * reload flashes, and a missing event just means the server copy never
 * updates and the choice quietly fails to follow the user to another device.
 */

/** jsdom has no matchMedia; install one that reports a fixed OS preference. */
function stubMatchMedia(dark: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches: dark,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return {
    /** Flip the OS preference and fire the change, as the browser would. */
    set(next: boolean) {
      mql.matches = next;
      listeners.forEach((fn) => fn());
    },
    listenerCount: () => listeners.size,
  };
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  vi.unstubAllGlobals();
});

describe("readThemePreference", () => {
  it("reports 'system' when nothing is stored", () => {
    // "system" is the ABSENCE of a stored value, matching the bootstrap's
    // fall-through to prefers-color-scheme.
    expect(readThemePreference()).toBe("system");
  });

  it("reads an explicit stored theme", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(readThemePreference()).toBe("dark");
  });

  it("treats a corrupt value as 'system' rather than trusting it", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    expect(readThemePreference()).toBe("system");
    localStorage.setItem(THEME_STORAGE_KEY, "chartreuse");
    expect(readThemePreference()).toBe("system");
  });
});

describe("applyThemePreference", () => {
  it("stores an explicit theme and paints it", () => {
    expect(applyThemePreference("dark")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    expect(currentTheme()).toBe("dark");
  });

  it("REMOVES the key for 'system' instead of writing the word", () => {
    // Writing "system" would make the no-flash bootstrap read it as corrupt.
    // It would still land on the OS theme — by accident, not by design — and
    // the accident breaks the moment the bootstrap grows a third value.
    stubMatchMedia(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(applyThemePreference("system")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
  });

  it("announces the change on the window bus", () => {
    const seen: ThemeChangeDetail[] = [];
    const off = onThemeChange((detail) => seen.push(detail));
    applyThemePreference("dark");
    off();
    applyThemePreference("light");
    expect(seen).toEqual([{ preference: "dark", theme: "dark" }]);
  });

  it("stays silent when announce is false", () => {
    // The host applies the value it just READ from /me/preferences this way;
    // announcing would make its own sync listener echo it back as a save.
    const seen: ThemeChangeDetail[] = [];
    const off = onThemeChange((detail) => seen.push(detail));
    applyThemePreference("dark", { announce: false });
    off();
    expect(seen).toEqual([]);
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
  });

  it("still paints when storage throws", () => {
    // Safari private mode. A theme is decoration; it must not be able to
    // break the page it decorates.
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    expect(() => applyThemePreference("dark")).not.toThrow();
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    setItem.mockRestore();
  });
});

describe("resolveTheme / systemTheme", () => {
  it("passes an explicit preference through untouched", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves 'system' from the OS query", () => {
    stubMatchMedia(true);
    expect(resolveTheme("system")).toBe("dark");
    stubMatchMedia(false);
    expect(resolveTheme("system")).toBe("light");
  });

  it("falls back to light where matchMedia is missing", () => {
    // Same fallback as the no-flash bootstrap, so the two cannot disagree.
    expect(systemTheme()).toBe("light");
  });
});

describe("startSystemThemeSync", () => {
  it("follows the OS while the preference is 'system'", () => {
    // Without this, "System" means "whatever the OS said at page load",
    // which reads as the setting not working.
    const media = stubMatchMedia(false);
    applyThemePreference("system");
    const stop = startSystemThemeSync();
    media.set(true);
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    stop();
  });

  it("does NOT override an explicit choice made mid-session", () => {
    const media = stubMatchMedia(false);
    const stop = startSystemThemeSync();
    applyThemePreference("light");
    media.set(true);
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("light");
    stop();
  });

  it("unsubscribes cleanly", () => {
    const media = stubMatchMedia(false);
    const stop = startSystemThemeSync();
    expect(media.listenerCount()).toBe(1);
    stop();
    expect(media.listenerCount()).toBe(0);
  });

  it("is a no-op without matchMedia", () => {
    expect(() => startSystemThemeSync()()).not.toThrow();
  });
});

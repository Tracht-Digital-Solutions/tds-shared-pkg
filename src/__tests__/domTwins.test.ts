// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consentLinkMarkup, mountConsentLinks, mountThemeToggles, themeToggleMarkup } from "../dom";
import { CONSENT_KEY, CONSENT_OPEN_EVENT, takeConsentOpenRequest, writeConsent } from "../consent/store";
import { necessaryOnly } from "../consent/categories";
import clientWhen from "../astro/clientWhen";

/**
 * The plain-DOM toggle and consent link, and `client:when` — the pieces that
 * let a public page skip React (tds-blog-frontend#27).
 */
beforeEach(() => {
  localStorage.clear();
  document.cookie = "tds_signed_in=; max-age=0";
  document.documentElement.removeAttribute("data-theme");
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }));
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  takeConsentOpenRequest();
});

describe("plain-DOM theme toggle", () => {
  const render = () => {
    document.body.innerHTML = themeToggleMarkup({ labelToDark: "Dunkel", labelToLight: "Hell" });
    return document.querySelector("button")!;
  };

  it("is a type=button with the dark-target label", () => {
    const button = render();
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Dunkel");
  });

  it("escapes its labels", () => {
    document.body.innerHTML = themeToggleMarkup({ labelToDark: '"><img>' });
    expect(document.querySelector("img")).toBeNull();
  });

  it("flips and persists the theme, and relabels itself", () => {
    const button = render();
    mountThemeToggles();
    button.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("tds-theme")).toBe("dark");
    expect(button.getAttribute("aria-label")).toBe("Hell");
    button.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(button.getAttribute("aria-label")).toBe("Dunkel");
  });

  it("starts with the label for a page already dark", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const button = render();
    mountThemeToggles();
    expect(button.getAttribute("aria-label")).toBe("Hell");
  });

  it("wires each button once, however often it is mounted", () => {
    const button = render();
    mountThemeToggles();
    mountThemeToggles();
    button.click();
    // Two handlers would flip twice and land back on light.
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("turns the icon on a click and never on mount", () => {
    const button = render();
    mountThemeToggles();
    expect(button.querySelector(".tds-theme-toggle__icon--turn")).toBeNull();
    button.click();
    expect(button.querySelectorAll(".tds-theme-toggle__icon--turn")).toHaveLength(2);
  });
});

describe("plain-DOM consent link", () => {
  it("renders the localised button with the caller's classes", () => {
    document.body.innerHTML = consentLinkMarkup({ lang: "en", className: "footer-link" });
    const button = document.querySelector("button")!;
    expect(button.className).toBe("consent-link footer-link");
    expect(button.textContent).toBe("Cookie settings");
  });

  it("asks for the settings, and the request waits for a banner", () => {
    document.body.innerHTML = consentLinkMarkup();
    mountConsentLinks();
    const heard = vi.fn();
    window.addEventListener(CONSENT_OPEN_EVENT, heard);
    document.querySelector("button")!.click();
    window.removeEventListener(CONSENT_OPEN_EVENT, heard);
    expect(heard).toHaveBeenCalledOnce();
    expect(takeConsentOpenRequest()).toBe(true);
    expect(takeConsentOpenRequest()).toBe(false);
  });
});

describe("client:when", () => {
  const run = async (value: string, el?: HTMLElement) => {
    const hydrate = vi.fn(async () => {});
    const load = vi.fn(async () => hydrate);
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => cb());
    clientWhen(load, { value }, el);
    await new Promise((r) => setTimeout(r, 0));
    return { load, hydrate };
  };

  it("leaves the account menu alone for a visitor never signed in", async () => {
    expect((await run("session")).load).not.toHaveBeenCalled();
  });

  it("loads the account menu when a session may exist", async () => {
    document.cookie = "tds_signed_in=1";
    const { load, hydrate } = await run("session");
    expect(load).toHaveBeenCalledOnce();
    expect(hydrate).toHaveBeenCalledOnce();
  });

  it("loads the banner while no decision is stored", async () => {
    expect((await run("consent")).load).toHaveBeenCalledOnce();
  });

  it("loads the banner after a decision only when the visitor asks", async () => {
    writeConsent(necessaryOnly(), "de");
    const { load } = await run("consent");
    expect(load).not.toHaveBeenCalled();
    window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT));
    await new Promise((r) => setTimeout(r, 0));
    expect(load).toHaveBeenCalledOnce();
  });

  it("asks again when the stored decision is from an older version", async () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: 999 }));
    expect((await run("consent")).load).toHaveBeenCalledOnce();
  });

  it("stays out of the way of an unknown condition by hydrating", async () => {
    expect((await run("typo")).load).toHaveBeenCalledOnce();
  });

  it("skips the chat a visitor hid, without asking the server", async () => {
    localStorage.setItem("tds-live-chat-hidden:blog", "1");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await run("chat:blog:de")).load).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe("intent", () => {
    const setup = () => {
      document.body.innerHTML = '<button data-open><span>Assistent</span></button><button data-other></button>';
      const island = document.createElement("astro-island");
      island.innerHTML = "<form></form>";
      document.body.append(island);
      return island;
    };

    it("waits until the visitor reaches for a matching control", async () => {
      const island = setup();
      const { load } = await run("intent:[data-open]", island);
      document.querySelector("[data-other]")!.dispatchEvent(new Event("pointerover", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
      expect(load).not.toHaveBeenCalled();
      // A hover on a child of the control counts.
      document.querySelector("[data-open] span")!.dispatchEvent(new Event("pointerover", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
      expect(load).toHaveBeenCalledOnce();
    });

    it("counts keyboard focus as intent, once", async () => {
      const island = setup();
      const { load } = await run("intent:[data-open]", island);
      const button = document.querySelector<HTMLButtonElement>("[data-open]")!;
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
      expect(load).toHaveBeenCalledOnce();
    });
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import ConsentBanner from "../consent/ConsentBanner";
import { mountConsentBanner, type MountConsentBannerOptions } from "../dom";
import { CONSENT_KEY, openConsentSettings, readConsent, takeConsentOpenRequest, writeConsent } from "../consent/store";
import { necessaryOnly, type OptionalCategory } from "../consent/categories";

/**
 * The plain-DOM consent banner (0.64.8). It must be the React banner's twin:
 * the markup is compared node for node, so the shared CSS styles both the
 * same, and the behaviour tests mirror consent.test.tsx.
 */
const asking = { categories: ["analytics", "marketing"] as readonly OptionalCategory[] };
let stop: () => void = () => {};

function mountDom(options: MountConsentBannerOptions = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  stop = mountConsentBanner({ ...options, host, immediate: true });
  return host;
}

/**
 * Canonical markup: attributes sorted (their order means nothing to CSS) and
 * ids masked (React's `:r1:` and ours differ by construction). Tags, classes,
 * attributes, text and nesting must match exactly.
 */
function normalise(node: Element): string {
  const clone = node.cloneNode(true) as Element;
  for (const e of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
    const attrs = Array.from(e.attributes)
      .map((a) => [a.name, /^(id|aria-labelledby|aria-describedby)$/.test(a.name) ? "X" : a.value] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    for (const a of Array.from(e.attributes)) e.removeAttribute(a.name);
    for (const [name, value] of attrs) e.setAttribute(name, value);
  }
  return clone.outerHTML.replace(/<!--.*?-->/g, "");
}

const click = (node: Element | null | undefined) => {
  expect(node).toBeTruthy();
  (node as HTMLElement).click();
};
const byText = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => b.textContent === text) ?? null;

beforeEach(() => {
  localStorage.clear();
  takeConsentOpenRequest();
});

afterEach(() => {
  stop();
  cleanup();
  document.body.innerHTML = "";
  localStorage.clear();
  document.documentElement.style.removeProperty("--tds-bottom-lane");
});

describe("the plain-DOM banner is the React banner's twin", () => {
  for (const [name, props] of [
    ["asking, de", { ...asking, lang: "de" as const, privacyUrl: "/legal/datenschutz" }],
    ["asking, en", { ...asking, lang: "en" as const, privacyUrl: "/en/legal/privacy" }],
    ["informational", { lang: "de" as const }],
  ] as const) {
    it(`renders the same banner markup (${name})`, () => {
      const { container } = render(<ConsentBanner {...props} />);
      const react = normalise(container.querySelector("aside")!);
      cleanup();
      const host = mountDom(props);
      expect(normalise(host.querySelector("aside")!)).toBe(react);
    });
  }

  it("renders the same settings dialog", () => {
    const props = { ...asking, privacyUrl: "/legal/datenschutz", imprintUrl: "/legal/impressum" };
    const { container } = render(<ConsentBanner {...props} />);
    act(() => click(byText(container, "Einstellungen")));
    const react = normalise(container.querySelector("dialog")!);
    cleanup();
    const host = mountDom(props);
    click(byText(host, "Einstellungen"));
    expect(normalise(host.querySelector("dialog")!)).toBe(react);
  });
});

describe("the plain-DOM banner behaves like the React one", () => {
  it("writes nothing before the visitor answers", () => {
    mountDom(asking);
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
  });

  it("does not mount before an idle moment unless asked to", () => {
    const host = document.createElement("div");
    document.body.append(host);
    stop = mountConsentBanner({ ...asking, host });
    expect(host.querySelector("aside")).toBeNull();
  });

  it("is a no-op the second time on a page", () => {
    const host = mountDom(asking);
    mountConsentBanner({ ...asking, host, immediate: true });
    expect(host.querySelectorAll("aside")).toHaveLength(1);
  });

  it("stores every shown purpose on Alle akzeptieren and leaves", () => {
    const host = mountDom({ categories: ["marketing"] });
    click(byText(host, "Alle akzeptieren"));
    expect(host.querySelector("aside")).toBeNull();
    expect(readConsent()?.choices).toMatchObject({ analytics: false, functional: false, marketing: true });
  });

  it("stores a refusal on Nur notwendige", () => {
    const host = mountDom(asking);
    click(byText(host, "Nur notwendige"));
    expect(readConsent()?.choices).toMatchObject({ analytics: false, marketing: false });
  });

  it("stays away once a decision exists", () => {
    writeConsent(necessaryOnly(), "de");
    expect(mountDom(asking).querySelector("aside")).toBeNull();
  });

  it("takes focus only when it asks something", () => {
    const host = mountDom(asking);
    expect(document.activeElement).toBe(host.querySelector("aside"));
    stop();
    document.body.innerHTML = "";
    const quiet = mountDom();
    expect(document.activeElement).not.toBe(quiet.querySelector("aside"));
  });

  it("publishes and clears the bottom lane", () => {
    const lane = () => document.documentElement.style.getPropertyValue("--tds-bottom-lane");
    const host = mountDom(asking);
    expect(lane()).toMatch(/^\d+px$/);
    click(byText(host, "Nur notwendige"));
    expect(lane()).toBe("");
  });

  it("starts undecided switches off, saves exactly what was switched on", () => {
    const host = mountDom(asking);
    click(byText(host, "Einstellungen"));
    const boxes = Array.from(host.querySelectorAll<HTMLInputElement>("dialog input[type=checkbox]"));
    expect(boxes.map((b) => [b.checked, b.disabled])).toEqual([
      [true, true],
      [false, false],
      [false, false],
    ]);
    boxes[1]!.click();
    click(byText(host, "Auswahl speichern"));
    expect(readConsent()?.choices).toMatchObject({ analytics: true, marketing: false });
  });

  it("reopens from the footer link with the stored choice, after a decision", () => {
    writeConsent({ ...necessaryOnly(), marketing: true }, "de");
    const host = mountDom(asking);
    openConsentSettings();
    const boxes = host.querySelectorAll<HTMLInputElement>("dialog input[type=checkbox]");
    expect(boxes[2]!.checked).toBe(true);
  });

  it("honours a request made before it was mounted", () => {
    writeConsent(necessaryOnly(), "de");
    openConsentSettings();
    expect(mountDom(asking).querySelector("dialog")).not.toBeNull();
  });

  it("discards an abandoned edit", () => {
    const host = mountDom(asking);
    click(byText(host, "Einstellungen"));
    host.querySelectorAll<HTMLInputElement>("dialog input[type=checkbox]")[1]!.click();
    click(host.querySelector('dialog [aria-label="Schließen"]'));
    openConsentSettings();
    // Reopened within the exit transition: exactly one dialog remains.
    expect(host.querySelectorAll("dialog")).toHaveLength(1);
    const boxes = host.querySelectorAll<HTMLInputElement>("dialog input[type=checkbox]");
    expect(boxes[1]!.checked).toBe(false);
  });
});

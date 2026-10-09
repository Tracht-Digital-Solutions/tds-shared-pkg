// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_KEY,
  VISITOR_KEY,
  analyticsVisitorId,
  forgetAnalytics,
  startAnalytics,
  type AnalyticsBatch,
} from "../analytics/index";
import { necessaryOnly } from "../consent/categories";
import { writeConsent } from "../consent/store";

const ENDPOINT = "https://api.test/analytics";

let beacons: Array<{ url: string; batch: AnalyticsBatch }>;
let stop: (() => void) | null;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = "";
  beacons = [];
  stop = null;
  vi.useFakeTimers();
  vi.stubGlobal("navigator", {
    ...navigator,
    sendBeacon: (url: string, body: string) => {
      beacons.push({ url, batch: JSON.parse(body) as AnalyticsBatch });
      return true;
    },
  });
});

afterEach(() => {
  stop?.();
  vi.useRealTimers();
});

const grant = () => writeConsent({ ...necessaryOnly(), analytics: true }, "de");
const start = () => {
  stop = startAnalytics({ site: "landing", lang: "de", endpoint: ENDPOINT });
};
/** The endpoint resolves through a promise; let it settle after a flush. */
const settle = async () => {
  await vi.advanceTimersByTimeAsync(1100);
};
const events = () => beacons.flatMap((b) => b.batch.events);

describe("startAnalytics", () => {
  it("sends nothing and stores nothing without consent", async () => {
    start();
    document.body.innerHTML = `<button data-track="hero">x</button>`;
    document.querySelector("button")!.click();
    await settle();
    expect(beacons).toHaveLength(0);
    expect(localStorage.getItem(VISITOR_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("counts a page view once consent is given", async () => {
    start();
    grant();
    await settle();
    expect(beacons[0]?.url).toBe(`${ENDPOINT}/collect`);
    expect(events()).toContainEqual({ t: "pageview", p: "/" });
    expect(analyticsVisitorId()).toBe(beacons[0]?.batch.vid);
    expect(beacons[0]?.batch.ret).toBe(false);
  });

  it("deletes both ids the moment consent is withdrawn", async () => {
    grant();
    start();
    await settle();
    expect(analyticsVisitorId()).not.toBeNull();
    writeConsent(necessaryOnly(), "de");
    expect(localStorage.getItem(VISITOR_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    const before = beacons.length;
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(beacons).toHaveLength(before);
  });

  it("names tracked clicks and outbound hosts, nothing else", async () => {
    grant();
    document.body.innerHTML = `
      <a href="/kontakt" data-track="hero-primary"><span>Go</span></a>
      <a href="https://www.linkedin.com/in/x?secret=1">out</a>
      <a href="/intern">in</a>`;
    start();
    document.querySelector("span")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.querySelectorAll("a")[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.querySelectorAll("a")[2]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();
    const clicks = events().filter((e) => e.t === "click" || e.t === "outbound");
    expect(clicks).toEqual([
      { t: "click", p: "/", k: "hero-primary" },
      { t: "outbound", p: "/", k: "www.linkedin.com" },
    ]);
  });

  it("records form field names but never their values", async () => {
    grant();
    document.body.innerHTML = `
      <form data-track-form="contact">
        <input name="email" value="someone@example.com" />
        <textarea name="message">secret text</textarea>
      </form>`;
    start();
    const [email, message] = Array.from(document.querySelectorAll<HTMLElement>("input,textarea"));
    email!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    message!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();
    const form = events().filter((e) => e.t.startsWith("form_"));
    expect(form).toEqual([
      { t: "form_start", p: "/", k: "contact" },
      { t: "form_field", p: "/", k: "contact", f: "email" },
      { t: "form_field", p: "/", k: "contact", f: "message" },
      { t: "form_submit", p: "/", k: "contact" },
    ]);
    const wire = JSON.stringify(beacons);
    expect(wire).not.toContain("someone@example.com");
    expect(wire).not.toContain("secret text");
  });

  it("waits for a prerendered page to be shown", async () => {
    grant();
    Object.defineProperty(document, "prerendering", { value: true, configurable: true });
    try {
      start();
      await settle();
      expect(events().filter((e) => e.t === "pageview")).toHaveLength(0);
      document.dispatchEvent(new Event("prerenderingchange"));
      await settle();
      expect(events().filter((e) => e.t === "pageview")).toHaveLength(1);
    } finally {
      delete (document as { prerendering?: boolean }).prerendering;
    }
  });

  it("honours Global Privacy Control even after consent", async () => {
    vi.stubGlobal("navigator", { ...navigator, globalPrivacyControl: true, sendBeacon: () => true });
    grant();
    start();
    await settle();
    expect(localStorage.getItem(VISITOR_KEY)).toBeNull();
  });

  it("keeps an expiring visitor id with a fixed 30-day lifetime", async () => {
    grant();
    start();
    await settle();
    const stored = JSON.parse(localStorage.getItem(VISITOR_KEY)!) as { exp: number };
    expect(stored.exp - Date.now()).toBeGreaterThan(29 * 24 * 3600 * 1000);
    expect(stored.exp - Date.now()).toBeLessThanOrEqual(30 * 24 * 3600 * 1000);
    vi.setSystemTime(Date.now() + 31 * 24 * 3600 * 1000);
    expect(analyticsVisitorId()).toBeNull();
  });
});

describe("forgetAnalytics", () => {
  it("asks the server to erase the id and then forgets it", async () => {
    vi.useRealTimers();
    localStorage.setItem(VISITOR_KEY, JSON.stringify({ id: "v-1", exp: Date.now() + 1000 }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(forgetAnalytics(ENDPOINT)).resolves.toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${ENDPOINT}/forget`);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body as string)).toEqual({ visitorId: "v-1" });
    expect(localStorage.getItem(VISITOR_KEY)).toBeNull();
  });

  it("keeps the id when the server could not be reached", async () => {
    vi.useRealTimers();
    localStorage.setItem(VISITOR_KEY, JSON.stringify({ id: "v-2", exp: Date.now() + 1000 }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(forgetAnalytics(ENDPOINT)).resolves.toBe(false);
    expect(analyticsVisitorId()).toBe("v-2");
  });
});

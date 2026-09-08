// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import ConsentBanner from "../consent/ConsentBanner";
import ConsentLink from "../consent/ConsentLink";
import ConsentPlaceholder from "../consent/ConsentPlaceholder";
import {
  CONSENT_EVENT,
  CONSENT_KEY,
  consentGranted,
  onConsentChange,
  openConsentSettings,
  readConsent,
  writeConsent,
} from "../consent/store";
import { CONSENT_VERSION, necessaryOnly } from "../consent/categories";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.style.removeProperty("--tds-bottom-lane");
});

/* ------------------------------------------------------------------ */
/* The store                                                           */
/* ------------------------------------------------------------------ */

describe("the consent record", () => {
  it("reads as undecided when nothing is stored", () => {
    expect(readConsent()).toBeNull();
  });

  it("stores the choice with a version and a timestamp", () => {
    const before = Date.now();
    const record = writeConsent({ ...necessaryOnly(), analytics: true }, "de");

    expect(record.v).toBe(CONSENT_VERSION);
    expect(record.choices.analytics).toBe(true);
    expect(record.lang).toBe("de");
    // Art. 7 Abs. 1 DSGVO puts the burden of DEMONSTRATING a consent on us, and
    // a boolean without a time and a version demonstrates nothing.
    expect(Date.parse(record.ts as string)).toBeGreaterThanOrEqual(before);

    const raw = JSON.parse(localStorage.getItem(CONSENT_KEY) as string);
    expect(raw.v).toBe(CONSENT_VERSION);
    expect(typeof raw.ts).toBe("string");
  });

  it("never stores `necessary` as a decision that could come back false", () => {
    // Storage is writable by anyone with devtools; a tampered record must not
    // be able to switch off the storage the site cannot work without.
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ v: CONSENT_VERSION, ts: null, lang: "de", choices: { necessary: false } }),
    );
    expect(readConsent()?.choices.necessary).toBe(true);
    expect(consentGranted("necessary")).toBe(true);
  });

  it("treats a record from an older version as undecided", () => {
    // A purpose that changed was never consented to.
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ v: CONSENT_VERSION - 1, ts: null, lang: "de", choices: { marketing: true } }),
    );
    expect(readConsent()).toBeNull();
  });

  it("treats unparseable bytes as undecided rather than trusting them", () => {
    localStorage.setItem(CONSENT_KEY, "{not json");
    expect(readConsent()).toBeNull();
    expect(consentGranted("marketing")).toBe(false);
  });

  it("treats unreadable storage as undecided", () => {
    // Private mode / blocked site data. A browser that cannot remember a
    // decision must be ASKED, not defaulted into agreement.
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readConsent()).toBeNull();
    spy.mockRestore();
  });

  it("refuses every optional purpose while undecided", () => {
    expect(consentGranted("functional")).toBe(false);
    expect(consentGranted("analytics")).toBe(false);
    expect(consentGranted("marketing")).toBe(false);
    expect(consentGranted("necessary")).toBe(true);
  });

  it("notifies subscribers", () => {
    const seen: string[] = [];
    const off = onConsentChange((r) => seen.push(String(r.choices.analytics)));
    writeConsent({ ...necessaryOnly(), analytics: true }, "de");
    off();
    writeConsent(necessaryOnly(), "de");
    expect(seen).toEqual(["true"]);
  });
});

describe("the legacy advertising key", () => {
  it("carries a prior ad choice over instead of asking again", () => {
    localStorage.setItem("tds-ad-consent", "granted");
    const record = readConsent();
    expect(record?.choices.marketing).toBe(true);
    // The other two purposes did not exist when that key was written. An
    // absent answer is a "no", never an assumed "yes".
    expect(record?.choices.analytics).toBe(false);
    expect(record?.choices.functional).toBe(false);
    // Time unknown — and not invented, which would manufacture a proof of
    // something that never happened.
    expect(record?.ts).toBeNull();
  });

  it("does not write the carried-over answer back as a fresh record", () => {
    localStorage.setItem("tds-ad-consent", "denied");
    readConsent();
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
  });

  it("keeps writing the key the blog's ad loader reads", () => {
    // tds-blog-frontend injects adsbygoogle.js off this key and ships on its
    // own release cadence. Dropping the write would silently stop advertising
    // working on a site this package cannot see.
    const heard: unknown[] = [];
    const h = (e: Event) => heard.push((e as CustomEvent).detail);
    window.addEventListener("tds-ad-consent", h);

    writeConsent({ ...necessaryOnly(), marketing: true }, "de");
    expect(localStorage.getItem("tds-ad-consent")).toBe("granted");

    writeConsent(necessaryOnly(), "de");
    expect(localStorage.getItem("tds-ad-consent")).toBe("denied");

    window.removeEventListener("tds-ad-consent", h);
    expect(heard).toEqual(["granted", "denied"]);
  });
});

/* ------------------------------------------------------------------ */
/* The banner                                                          */
/* ------------------------------------------------------------------ */

const asking = { categories: ["analytics", "marketing"] as const };

/**
 * The dialog's switches, in row order: necessary, analytics, marketing.
 *
 * A helper rather than four `!` escapes at the call sites.
 * `noUncheckedIndexedAccess` is on, and rightly — an index into a query result
 * is only defined if the query found that many. Asserting the shape once is the
 * honest way past it, and if a row ever goes missing this fails where the
 * reason is legible instead of throwing "undefined is not an object" three
 * lines later.
 */
function switches(all: HTMLElement[]): [HTMLInputElement, HTMLInputElement, HTMLInputElement] {
  expect(all).toHaveLength(3);
  return all as [HTMLInputElement, HTMLInputElement, HTMLInputElement];
}

describe("the banner", () => {
  it("writes nothing before the visitor answers", () => {
    render(<ConsentBanner {...asking} />);
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
    expect(localStorage.getItem("tds-ad-consent")).toBeNull();
  });

  it("gives the two decisions identical styling", () => {
    // Refusing must be no harder than agreeing (Art. 7 Abs. 3 DSGVO). A filled
    // accept beside an outlined reject is the most frequently criticised
    // construction in German consent-banner enforcement — this is the test
    // that fails if someone "improves" the emphasis.
    const { getByText } = render(<ConsentBanner {...asking} />);
    const accept = getByText("Alle akzeptieren");
    const reject = getByText("Nur notwendige");
    expect(reject.className).toBe(accept.className);
    // …and the quieter one decides nothing, so it may look quieter.
    expect(getByText("Einstellungen").className).not.toBe(accept.className);
  });

  it("stores every purpose on Alle akzeptieren", () => {
    const { getByText, queryByRole } = render(<ConsentBanner {...asking} />);
    fireEvent.click(getByText("Alle akzeptieren"));
    expect(queryByRole("region")).toBeNull();
    expect(readConsent()?.choices).toMatchObject({ analytics: true, marketing: true });
  });

  it("stores a refusal on Nur notwendige", () => {
    const { getByText } = render(<ConsentBanner {...asking} />);
    fireEvent.click(getByText("Nur notwendige"));
    const record = readConsent();
    // A refusal is a decision and is recorded as one — otherwise the banner
    // would come back on the next page and wear the visitor down.
    expect(record).not.toBeNull();
    expect(record?.choices).toMatchObject({ analytics: false, marketing: false });
  });

  it("stays away once a decision exists", () => {
    writeConsent(necessaryOnly(), "de");
    const { queryByRole } = render(<ConsentBanner {...asking} />);
    expect(queryByRole("region")).toBeNull();
  });

  it("asks nothing when the site has no optional purposes", () => {
    // Soliciting a consent you do not need is its own dark pattern.
    const { getByRole } = render(<ConsentBanner />);
    expect(getByRole("region").textContent).toContain("Tracking-Cookies");
    expect(getByRole("button").textContent).toBe("Verstanden");
  });

  it("localises to English", () => {
    const { getByText } = render(<ConsentBanner {...asking} lang="en" />);
    expect(getByText("Necessary only")).toBeTruthy();
  });

  it("links the privacy policy it was given", () => {
    const { getByRole } = render(<ConsentBanner {...asking} privacyUrl="/rechtliches/datenschutz" />);
    expect(getByRole("link").getAttribute("href")).toBe("/rechtliches/datenschutz");
  });

  it("takes focus when there is a question, so a screen reader meets it", () => {
    const { getByRole } = render(<ConsentBanner {...asking} />);
    expect(document.activeElement).toBe(getByRole("region"));
  });

  it("does not take focus for a notice that asks nothing", () => {
    const { getByRole } = render(<ConsentBanner />);
    expect(document.activeElement).not.toBe(getByRole("region"));
  });

  it("publishes and clears the bottom lane", () => {
    const lane = () => document.documentElement.style.getPropertyValue("--tds-bottom-lane");
    const { getByText } = render(<ConsentBanner {...asking} />);
    expect(lane()).toMatch(/^\d+px$/);
    fireEvent.click(getByText("Nur notwendige"));
    expect(lane()).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/* The settings dialog and the way back in                             */
/* ------------------------------------------------------------------ */

describe("the settings dialog", () => {
  it("opens from the banner and shows one row per purpose", () => {
    const { getByText, getAllByRole } = render(<ConsentBanner {...asking} />);
    fireEvent.click(getByText("Einstellungen"));
    // necessary + the two the site declared
    expect(getAllByRole("checkbox")).toHaveLength(3);
  });

  it("shows `necessary` as on and not decidable", () => {
    const { getByText, getAllByRole } = render(<ConsentBanner {...asking} />);
    fireEvent.click(getByText("Einstellungen"));
    const [necessary] = switches(getAllByRole("checkbox"));
    expect(necessary.checked).toBe(true);
    expect(necessary.disabled).toBe(true);
  });

  it("starts every optional purpose off for an undecided visitor", () => {
    // An inactive default is not a consent (Art. 4 Nr. 11 DSGVO).
    const { getByText, getAllByRole } = render(<ConsentBanner {...asking} />);
    fireEvent.click(getByText("Einstellungen"));
    const [, analytics, marketing] = switches(getAllByRole("checkbox"));
    expect(analytics.checked).toBe(false);
    expect(marketing.checked).toBe(false);
  });

  it("saves exactly what was switched on", () => {
    const { getByText, getAllByRole } = render(<ConsentBanner {...asking} />);
    fireEvent.click(getByText("Einstellungen"));
    const [, analytics] = switches(getAllByRole("checkbox"));
    fireEvent.click(analytics);
    fireEvent.click(getByText("Auswahl speichern"));
    expect(readConsent()?.choices).toMatchObject({ analytics: true, marketing: false });
  });

  it("reopens after a decision, so a consent can be withdrawn", () => {
    // Art. 7 Abs. 3 DSGVO: withdrawing must be as easy as giving.
    writeConsent({ ...necessaryOnly(), marketing: true }, "de");
    const { queryByRole, getAllByRole } = render(<ConsentBanner {...asking} />);
    expect(queryByRole("region")).toBeNull();

    act(() => openConsentSettings());
    // …and it opens showing what was actually stored, not a blank slate.
    const [, , marketing] = switches(getAllByRole("checkbox"));
    expect(marketing.checked).toBe(true);
  });

  it("discards an abandoned edit instead of remembering it", () => {
    const { getByText, getByLabelText, getAllByRole } = render(<ConsentBanner {...asking} />);
    fireEvent.click(getByText("Einstellungen"));
    fireEvent.click(switches(getAllByRole("checkbox"))[1]);
    fireEvent.click(getByLabelText("Schließen"));

    act(() => openConsentSettings());
    expect(switches(getAllByRole("checkbox"))[1].checked).toBe(false);
  });
});

describe("the footer link", () => {
  it("is a button, because it acts on this page rather than navigating", () => {
    const { getByRole } = render(<ConsentLink />);
    expect(getByRole("button").textContent).toBe("Cookie-Einstellungen");
  });

  it("opens the banner's settings across island boundaries", () => {
    const banner = render(<ConsentBanner {...asking} />);
    const link = render(<ConsentLink />);
    fireEvent.click(within(link.container).getByRole("button"));
    expect(banner.getAllByRole("checkbox")).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ */
/* The embed gate                                                      */
/* ------------------------------------------------------------------ */

describe("the click-to-load gate", () => {
  const embed = () => <iframe title="video" src="https://example.invalid/v" />;

  it("does not construct the embed before consent", () => {
    // The thunk is the whole mechanism: an <iframe> contacts its origin the
    // moment it mounts, and `youtube-nocookie.com` narrows what is STORED
    // without stopping the connection.
    const build = vi.fn(embed);
    const { queryByTitle, getByText } = render(
      <ConsentPlaceholder category="marketing" provider="YouTube">
        {build}
      </ConsentPlaceholder>,
    );
    expect(build).not.toHaveBeenCalled();
    expect(queryByTitle("video")).toBeNull();
    expect(getByText(/YouTube/)).toBeTruthy();
  });

  it("loads this one embed on request without storing a standing permission", () => {
    const { getByText, getByTitle } = render(
      <ConsentPlaceholder category="marketing" provider="Vimeo">
        {embed}
      </ConsentPlaceholder>,
    );
    fireEvent.click(getByText("Inhalt laden"));
    expect(getByTitle("video")).toBeTruthy();
    // One video was agreed to, not a permission.
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
  });

  it("renders the embed straight away once the category is consented to", () => {
    writeConsent({ ...necessaryOnly(), marketing: true }, "de");
    const { getByTitle } = render(
      <ConsentPlaceholder category="marketing" provider="YouTube">
        {embed}
      </ConsentPlaceholder>,
    );
    expect(getByTitle("video")).toBeTruthy();
  });

  it("closes again when the consent is withdrawn", () => {
    writeConsent({ ...necessaryOnly(), marketing: true }, "de");
    const { queryByTitle } = render(
      <ConsentPlaceholder category="marketing" provider="YouTube">
        {embed}
      </ConsentPlaceholder>,
    );
    expect(queryByTitle("video")).toBeTruthy();

    fireEvent(
      window,
      new CustomEvent(CONSENT_EVENT, {
        detail: writeConsent(necessaryOnly(), "de"),
      }),
    );
    expect(queryByTitle("video")).toBeNull();
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import CookieNotice, { getAdConsent } from "../components/CookieNotice";

/**
 * CookieNotice shows once per origin and remembers its dismissal in
 * localStorage. The mount effect gates rendering, so assertions run
 * after React flushes effects (render + immediate queries suffice with
 * testing-library's act-wrapped render).
 */
beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("CookieNotice", () => {
  it("shows the notice on first visit", () => {
    const { getByRole } = render(<CookieNotice />);
    expect(getByRole("region")).toBeTruthy();
  });

  it("stays hidden when already acknowledged", () => {
    localStorage.setItem("tds-cookie-notice", "1");
    const { queryByRole } = render(<CookieNotice />);
    expect(queryByRole("region")).toBeNull();
  });

  it("dismisses on click and persists the acknowledgement", () => {
    const { getByRole, queryByRole } = render(<CookieNotice />);
    fireEvent.click(getByRole("button"));
    expect(queryByRole("region")).toBeNull();
    expect(localStorage.getItem("tds-cookie-notice")).toBe("1");
  });

  it("honours a custom storage key", () => {
    localStorage.setItem("custom-key", "1");
    const { queryByRole } = render(<CookieNotice storageKey="custom-key" />);
    expect(queryByRole("region")).toBeNull();
  });

  it("renders the site wording by default and the panel wording on demand", () => {
    const site = render(<CookieNotice />);
    expect(site.getByRole("region").textContent).toContain("Tracking-Cookies");
    site.unmount();
    localStorage.clear();

    const panel = render(<CookieNotice variant="panel" />);
    expect(panel.getByRole("region").textContent).toContain("Session-Cookie");
  });

  it("localises to English and links the privacy policy", () => {
    const { getByRole } = render(
      <CookieNotice lang="en" privacyUrl="/legal/datenschutz" />,
    );
    expect(getByRole("button").textContent).toBe("Got it");
    expect(getByRole("link").getAttribute("href")).toBe("/legal/datenschutz");
  });

  describe("consent mode", () => {
    it("shows Accept + Decline and grants consent on Accept", () => {
      const { getByText, queryByRole } = render(<CookieNotice consent />);
      fireEvent.click(getByText("Akzeptieren"));
      expect(queryByRole("region")).toBeNull();
      expect(localStorage.getItem("tds-ad-consent")).toBe("granted");
      expect(getAdConsent()).toBe("granted");
    });

    it("denies consent on Decline", () => {
      const { getByText } = render(<CookieNotice consent />);
      fireEvent.click(getByText("Ablehnen"));
      expect(localStorage.getItem("tds-ad-consent")).toBe("denied");
    });

    it("stays hidden once a consent choice was made", () => {
      localStorage.setItem("tds-ad-consent", "denied");
      const { queryByRole } = render(<CookieNotice consent />);
      expect(queryByRole("region")).toBeNull();
    });
  });
});

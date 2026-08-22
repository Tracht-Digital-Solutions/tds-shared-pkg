// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AccountMenu from "../components/AccountMenu";
import {
  ACCOUNT_HINT_KEY,
  clearAccountHint,
  invalidateAccount,
  setAccountHint,
} from "../components/accountAuth";
import { primeRuntimeConfig, resetApiBase, resetRuntimeConfig } from "../api";

/**
 * The account menu on a PUBLIC site.
 *
 * The assertions that matter here are the ones with no visible failure mode.
 * A logout that silently leaves the session alive still closes the menu and
 * still reloads the page; a refresh probe fired for every anonymous reader
 * costs two round trips per page view and shows up nowhere; a sign-in link that
 * forgets `?next=` looks perfect until someone follows it and lands on a
 * dashboard instead of the article they were reading.
 */

const AUTH = "https://api.tracht-digital.de/auth";
const LOGIN = "https://auth.tracht-digital.de";
const PAGE = "https://blog.tracht-digital.de/artikel/digitalisierung";

const ME = {
  userId: 7,
  email: "julian@tracht-digital.de",
  name: "Julian Tracht",
  label: "Julian Tracht",
  isAdmin: false,
  isSupportAgent: false,
  isBlogAuthor: false,
  avatarUrl: null,
  hasAvatar: false,
  companies: [],
  customerId: null,
  permissions: [],
};

interface Route {
  match: RegExp;
  method?: string;
  status: number;
  body?: unknown;
}

let routes: Route[] = [];
let calls: Array<{ url: string; method: string }> = [];
let reload: ReturnType<typeof vi.fn>;

function respond(match: RegExp, status: number, body?: unknown, method = "GET") {
  routes.unshift({ match, method, status, body });
}

const requests = (match: RegExp, method = "GET") =>
  calls.filter((call) => match.test(call.url) && call.method === method);

beforeEach(() => {
  routes = [];
  calls = [];
  localStorage.clear();
  invalidateAccount();
  resetApiBase();
  resetRuntimeConfig();
  // Skip the /tds-runtime.json probe so every assertion below reads the
  // request the test is actually about.
  primeRuntimeConfig(null);

  reload = vi.fn();
  vi.stubGlobal("location", {
    href: PAGE,
    origin: "https://blog.tracht-digital.de",
    reload,
    replace: vi.fn(),
    assign: vi.fn(),
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method });
      const route = routes.find(
        (candidate) => candidate.match.test(url) && (candidate.method ?? "GET") === method,
      );
      if (route === undefined) return new Response(null, { status: 404 });
      return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
        status: route.status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearAccountHint();
  invalidateAccount();
  resetRuntimeConfig();
});

/** Wait for the mount probe to settle so a "renders nothing" assertion is not
    just reading the frame before the request came back. */
async function settled() {
  await waitFor(() => expect(requests(/\/auth\/me$/).length).toBeGreaterThan(0));
}

describe("a visitor with no session", () => {
  beforeEach(() => respond(/\/auth\/me$/, 401));

  it("gets nothing at all by default — the blog header stays as it was", async () => {
    const { container } = render(<AccountMenu />);
    expect(container.innerHTML).toBe("");
    await settled();
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("gets a sign-in link when the site asked for one", async () => {
    render(<AccountMenu loggedOut="login" />);
    const link = await screen.findByRole("link", { name: "Anmelden" });
    const href = new URL(link.getAttribute("href") ?? "");
    expect(href.origin).toBe(LOGIN);
    expect(href.searchParams.get("next")).toBe(PAGE);
  });

  it("shows that link IMMEDIATELY, not after the probe", () => {
    // The anonymous visitor is the common case on a public site. Painting
    // nothing first and the link a round trip later would shift the header for
    // almost everyone who ever sees it.
    render(<AccountMenu loggedOut="login" />);
    expect(screen.getByRole("link", { name: "Anmelden" })).toBeTruthy();
  });

  it("never spends a refresh round trip", async () => {
    render(<AccountMenu loggedOut="login" />);
    await settled();
    expect(requests(/\/refresh$/, "POST")).toHaveLength(0);
  });

  it("carries no stale hint away with it", async () => {
    setAccountHint();
    render(<AccountMenu />);
    await waitFor(() => expect(localStorage.getItem(ACCOUNT_HINT_KEY)).toBeNull());
  });
});

describe("a browser that has been signed in before", () => {
  beforeEach(() => setAccountHint());

  it("reserves the trigger's geometry while the probe is in flight", () => {
    respond(/\/auth\/me$/, 200, ME);
    const { container } = render(<AccountMenu />);
    const placeholder = container.querySelector(".tds-dropdown__trigger");
    expect(placeholder).not.toBeNull();
    expect((placeholder as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector(".tds-avatar")).not.toBeNull();
  });

  it("tries the remember-me exchange exactly once when /me says 401", async () => {
    respond(/\/auth\/me$/, 401);
    respond(/\/refresh$/, 401, undefined, "POST");
    render(<AccountMenu />);
    await waitFor(() => expect(requests(/\/refresh$/, "POST")).toHaveLength(1));
  });

  it("fills in after a refresh that worked", async () => {
    let refreshed = false;
    vi.mocked(fetch).mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method });
      if (/\/refresh$/.test(url)) {
        refreshed = true;
        return new Response(null, { status: 204 });
      }
      if (/\/auth\/me$/.test(url) || /\/me$/.test(url)) {
        return refreshed
          ? new Response(JSON.stringify(ME), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          : new Response(null, { status: 401 });
      }
      return new Response(null, { status: 404 });
    });

    render(<AccountMenu />);
    // The name sits in the trigger AND in the panel head, so this is
    // deliberately findAll — a bare findByText would fail on the success case.
    expect((await screen.findAllByText("Julian Tracht")).length).toBeGreaterThan(0);
  });
});

describe("a signed-in visitor", () => {
  beforeEach(() => respond(/\/auth\/me$/, 200, ME));

  it("sees their name and opens the menu from the trigger", async () => {
    render(<AccountMenu />);
    const trigger = await screen.findByRole("button", { name: /Kontomenü/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    const panel = document.querySelector(".tds-dropdown__panel") as HTMLElement;
    expect(panel.hasAttribute("hidden")).toBe(true);

    await userEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hasAttribute("hidden")).toBe(false);
  });

  it("offers the portal but not the management frontend", async () => {
    render(<AccountMenu />);
    await userEvent.click(await screen.findByRole("button", { name: /Kontomenü/ }));
    expect(screen.getByRole("menuitem", { name: "Kundenportal" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Verwaltung" })).toBeNull();
  });

  it("sends the password link to the central login site with a way back", async () => {
    render(<AccountMenu />);
    await userEvent.click(await screen.findByRole("button", { name: /Kontomenü/ }));
    const href = new URL(
      screen.getByRole("menuitem", { name: "Passwort ändern" }).getAttribute("href") ?? "",
    );
    expect(href.origin).toBe(LOGIN);
    expect(href.pathname).toBe("/passwort");
    expect(href.searchParams.get("next")).toBe(PAGE);
  });

  it("speaks English when asked", async () => {
    render(<AccountMenu lang="en" />);
    await userEvent.click(await screen.findByRole("button", { name: /Account menu/ }));
    expect(screen.getByRole("menuitem", { name: "Customer portal" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  });

  it("drops the name from the trigger when compact", async () => {
    const { container } = render(<AccountMenu compact />);
    await waitFor(() => expect(container.querySelector(".tds-dropdown")).not.toBeNull());
    const trigger = container.querySelector(".tds-dropdown__trigger") as HTMLElement;
    // The name survives only as the trigger's accessible name (`sr-only`),
    // never as visible label text.
    expect(trigger.querySelector(".tds-dropdown__label")).toBeNull();
  });
});

describe("an admin", () => {
  it("gets the management frontend as well", async () => {
    respond(/\/auth\/me$/, 200, { ...ME, isAdmin: true });
    render(<AccountMenu />);
    await userEvent.click(await screen.findByRole("button", { name: /Kontomenü/ }));
    expect(screen.getByRole("menuitem", { name: "Verwaltung" })).toBeTruthy();
  });
});

describe("signing out", () => {
  beforeEach(() => {
    respond(/\/auth\/me$/, 200, ME);
    respond(/\/logout$/, 204, undefined, "DELETE");
  });

  async function clickLogout() {
    render(<AccountMenu />);
    await userEvent.click(await screen.findByRole("button", { name: /Kontomenü/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Abmelden" }));
  }

  it("uses DELETE, because POST answers 405 and a catch cannot see it", async () => {
    await clickLogout();
    await waitFor(() => expect(requests(/\/logout$/, "DELETE")).toHaveLength(1));
    expect(requests(/\/logout$/, "POST")).toHaveLength(0);
  });

  it("reloads the public page instead of throwing the reader at a login form", async () => {
    await clickLogout();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(location.replace).not.toHaveBeenCalled();
  });

  it("forgets the hint, so the next page view costs one request", async () => {
    await clickLogout();
    await waitFor(() => expect(localStorage.getItem(ACCOUNT_HINT_KEY)).toBeNull());
  });

  it("stays on the page when the caller asked it to", async () => {
    render(<AccountMenu afterLogout="stay" />);
    await userEvent.click(await screen.findByRole("button", { name: /Kontomenü/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Abmelden" }));
    await waitFor(() => expect(requests(/\/logout$/, "DELETE")).toHaveLength(1));
    expect(reload).not.toHaveBeenCalled();
  });

  it("goes to the ABSOLUTE auth origin even when the host installed a proxy", async () => {
    // install/proxy.php deliberately drops Set-Cookie ("these sites read, they
    // never log in"), so a logout routed through `/api` answers 200 and ends
    // nothing. The session cookie would survive its own deletion, and the page
    // would reload straight back into a signed-in header.
    resetRuntimeConfig();
    resetApiBase();
    primeRuntimeConfig({ version: 1, site: "blog", mode: "proxy", apiBase: "/api" });

    await clickLogout();

    await waitFor(() => expect(requests(/\/logout$/, "DELETE")).toHaveLength(1));
    expect(requests(/\/logout$/, "DELETE")[0]?.url).toBe(`${AUTH}/logout`);
    // The READ side is free to follow the proxy — that is the whole point of
    // the two bases.
    expect(requests(/\/me$/).some((call) => call.url === "/api/auth/me")).toBe(true);
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LiveChatCta from "../components/LiveChatCta";
import { API_BASE_META, resetApiBase } from "../api";

/**
 * The floating support widget. It is mounted on the PUBLIC marketing site, the
 * blog, the portal and the tools site, so the first assertion that matters is
 * the negative one: **it renders nothing unless the backend says enabled**. A
 * regression there puts a chat bubble on tracht-digital.de for every visitor,
 * switched on by nobody.
 *
 * After that: the hide flag is per-frontend (dismissing it on the blog must not
 * silence it on the landing page), the contact form carries a honeypot that is
 * the only bot defence in the browser, and a 429 says "too many requests"
 * rather than "your input was invalid".
 */

interface Reply {
  status: number;
  body: unknown;
}
type Handler = (url: string, init?: RequestInit) => Reply | undefined;

let calls: Array<{ url: string; method: string; body: unknown; headers: Record<string, string> }> = [];
let handlers: Handler[] = [];
let gate: { match: RegExp; promise: Promise<void> } | null = null;

/** Keep matching requests in flight until the returned function is called. */
function holdRequests(match: RegExp) {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  gate = { match, promise };
  return () => {
    gate = null;
    release();
  };
}

/**
 * Path + query of a request, so route matchers below can stay anchored (`^/…`)
 * now that the widget resolves an absolute API base. `calls[].url` keeps the
 * full URL — which origin was called is its own assertion.
 */
const pathOf = (url: string) => url.replace(/^https?:\/\/[^/]+/i, "");

function respond(match: RegExp, body: unknown, status = 200, method?: string) {
  handlers.unshift((url, init) => {
    if (!match.test(pathOf(url))) return undefined;
    if (method && (init?.method ?? "GET") !== method) return undefined;
    return { status, body };
  });
}

const CONFIG = {
  enabled: true,
  cta: { label: "Fragen? Schreib uns", greeting: "Hallo! Wie können wir helfen?", accent: "#050f68" },
  tabs: { chat: true, faq: true, docs: true, contact: true },
  faqs: [{ id: 1, category: null, question: "Was kostet das?", answer: "Es kommt darauf an." }],
  docs: [{ id: 2, slug: "start", title: "Erste Schritte", body_markdown: "Absatz eins.\n\nAbsatz zwei." }],
};

beforeEach(() => {
  calls = [];
  gate = null;
  // apiBase() memoises after the first DOM read — without this, one test that
  // installs a meta tag would decide the base for every test after it.
  resetApiBase();
  localStorage.clear();
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
  handlers = [() => ({ status: 200, body: {} })];
  respond(/config\?/, CONFIG);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      const g = gate;
      if (g && g.match.test(pathOf(url))) await g.promise;
      const reply = handlers.map((h) => h(url, init)).find((r) => r !== undefined)!;
      return { ok: reply.status < 300, status: reply.status, json: async () => reply.body } as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const user = () => userEvent.setup({ delay: null });
const sent = (method: string, match: RegExp) =>
  calls.filter((c) => c.method === method && match.test(pathOf(c.url)));

/** Mount and wait for the config call to settle. */
async function mount(props: Partial<React.ComponentProps<typeof LiveChatCta>> = {}) {
  render(<LiveChatCta frontend="landingpage" {...props} />);
  const u = user();
  await waitFor(() => expect(calls.length).toBeGreaterThan(0));
  return u;
}

/** Mount and open the panel. */
async function open(props: Partial<React.ComponentProps<typeof LiveChatCta>> = {}) {
  const u = await mount(props);
  await u.click(await screen.findByRole("button", { name: /Fragen\? Schreib uns/ }));
  return u;
}

describe("it stays OFF unless the backend enables it", () => {
  it("renders nothing at all while the config is in flight", () => {
    render(<LiveChatCta frontend="landingpage" />);
    expect(document.body.querySelector(".live-chat-cta")).toBeNull();
  });

  it("renders NOTHING when the backend says disabled", async () => {
    // The public marketing site must not sprout a chat bubble nobody enabled.
    respond(/config\?/, { ...CONFIG, enabled: false });
    await mount();
    await waitFor(() => expect(calls.length).toBe(1));
    expect(document.body.querySelector(".live-chat-cta")).toBeNull();
  });

  it("renders nothing when the config request FAILS", async () => {
    respond(/config\?/, CONFIG, 500);
    await mount();
    await waitFor(() => expect(calls.length).toBe(1));
    expect(document.body.querySelector(".live-chat-cta")).toBeNull();
  });

  it("renders nothing when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    render(<LiveChatCta frontend="landingpage" />);
    await new Promise((r) => setTimeout(r, 10));
    expect(document.body.querySelector(".live-chat-cta")).toBeNull();
  });

  it("renders nothing when EVERY tab is switched off", async () => {
    // "Enabled" with no tabs would render an empty panel with no content.
    respond(/config\?/, { ...CONFIG, tabs: { chat: false, faq: false, docs: false, contact: false } });
    await mount();
    await waitFor(() => expect(calls.length).toBe(1));
    expect(document.body.querySelector(".live-chat-cta")).toBeNull();
  });

  it("shows the launcher once enabled", async () => {
    await mount();
    expect(await screen.findByRole("button", { name: /Fragen\? Schreib uns/ })).toBeTruthy();
  });

  it("asks for its own frontend and language", async () => {
    await mount({ frontend: "blog", lang: "en" });
    expect(calls[0]!.url).toContain("frontend=blog");
    expect(calls[0]!.url).toContain("lang=en");
  });

  it("URL-encodes the frontend key", async () => {
    await mount({ frontend: "a b&c" });
    expect(calls[0]!.url).toContain("frontend=a%20b%26c");
  });

  it("calls the API base the public sites pass in", async () => {
    // Public sites are a different origin from the API.
    await mount({ apiBase: "https://api.tracht-digital.de" });
    expect(calls[0]!.url).toBe(
      "https://api.tracht-digital.de/live-chat-cta/config?frontend=landingpage&lang=de",
    );
  });

  it("RESOLVES the API base when none is passed, instead of going same-origin", async () => {
    // This used to default to "" — relative. The one surface that omits the
    // prop is the panel, which is a static site on its own host, so every call
    // went to management.tracht-digital.de and came back as the SPA fallback
    // HTML with a 200: `res.ok` true, `res.json()` throwing, the catch
    // rendering a calm empty state. Same-origin is never the right default.
    await mount();
    expect(calls[0]!.url).toBe(
      "https://api.tracht-digital.de/live-chat-cta/config?frontend=landingpage&lang=de",
    );
  });

  it("lets the host's meta tag decide the base", async () => {
    resetApiBase();
    const meta = document.createElement("meta");
    meta.setAttribute("name", API_BASE_META);
    meta.setAttribute("content", "https://api.staging.test");
    document.head.appendChild(meta);
    try {
      await mount();
      expect(calls[0]!.url.startsWith("https://api.staging.test/live-chat-cta/")).toBe(true);
    } finally {
      meta.remove();
      resetApiBase();
    }
  });

  it("makes exactly ONE call on mount", async () => {
    // The widget is on every page of a public site; a chatty mount is a
    // measurable cost on the landing page.
    await mount();
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveLength(1);
  });
});

describe("the hide control", () => {
  it("hides the widget and remembers it", async () => {
    const u = await mount();
    await screen.findByRole("button", { name: /Fragen\? Schreib uns/ });
    await u.click(screen.getByRole("button", { name: "Ausblenden" }));
    expect(document.body.querySelector(".live-chat-cta")).toBeNull();
    expect(localStorage.getItem("tds-live-chat-hidden:landingpage")).toBe("1");
  });

  it("stays hidden on the next visit", async () => {
    localStorage.setItem("tds-live-chat-hidden:landingpage", "1");
    await mount();
    await waitFor(() => expect(calls.length).toBe(1));
    expect(document.body.querySelector(".live-chat-cta")).toBeNull();
  });

  it("keeps the dismissal PER FRONTEND", async () => {
    // Hiding it on the blog must not silence it on the landing page.
    localStorage.setItem("tds-live-chat-hidden:blog", "1");
    await mount({ frontend: "landingpage" });
    expect(await screen.findByRole("button", { name: /Fragen\? Schreib uns/ })).toBeTruthy();
  });

  it("survives blocked storage", async () => {
    // Safari private mode throws on setItem; the widget must not crash.
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException("QuotaExceeded"); };
    try {
      const u = await mount();
      await screen.findByRole("button", { name: /Fragen\? Schreib uns/ });
      await u.click(screen.getByRole("button", { name: "Ausblenden" }));
      expect(document.body.querySelector(".live-chat-cta")).toBeNull();
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
});

/**
 * The widget is `position: fixed` in the bottom-right corner at `z-index: 95`.
 * The landingpage's own "book a call" control is fixed in the SAME corner at
 * `z-index: 35`, so with the widget enabled for that frontend it covered the
 * control completely — two persistent CTAs, one of them invisible. The lane is
 * how a host page stacks its chrome above the launcher instead; it is the same
 * mechanism the cookie notice uses for the toast stack.
 */
describe("the bottom-right lane", () => {
  const lane = () => document.documentElement.style.getPropertyValue("--tds-right-lane");

  /** jsdom lays nothing out, so every rect is 0×0 — give the launcher a height. */
  const withMeasuredHeight = (px: number) => {
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return { ...original.call(this), height: px } as DOMRect;
    };
    return () => {
      Element.prototype.getBoundingClientRect = original;
    };
  };

  it("publishes the launcher's measured height while closed", async () => {
    const restore = withMeasuredHeight(56);
    try {
      await mount();
      await screen.findByRole("button", { name: /Fragen\? Schreib uns/ });
      await waitFor(() => expect(lane()).toBe("56px"));
    } finally {
      restore();
    }
  });

  it("clears the lane when the widget is hidden", async () => {
    // A lane left standing after the widget is gone pushes the host's own
    // chrome up the page forever, with nothing pointing back at this component.
    const restore = withMeasuredHeight(56);
    try {
      const u = await mount();
      await screen.findByRole("button", { name: /Fragen\? Schreib uns/ });
      await waitFor(() => expect(lane()).toBe("56px"));
      await u.click(screen.getByRole("button", { name: "Ausblenden" }));
      await waitFor(() => expect(lane()).toBe(""));
    } finally {
      restore();
    }
  });

  it("clears the lane while the panel is open", async () => {
    // An open panel is up to 34rem tall and already owns the corner. Lifting a
    // host's CTA above THAT would park it in the middle of the screen; the
    // panel simply covers it instead.
    const restore = withMeasuredHeight(56);
    try {
      await open();
      await waitFor(() => expect(lane()).toBe(""));
    } finally {
      restore();
    }
  });

  it("never publishes a lane while the backend keeps it disabled", async () => {
    respond(/config\?/, { ...CONFIG, enabled: false });
    await mount();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(lane()).toBe("");
  });
});

describe("the panel", () => {
  it("opens on the launcher and closes again", async () => {
    const u = await open();
    expect(screen.getByRole("dialog")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /Fragen\? Schreib uns/ })).toBeTruthy();
  });

  it("labels the dialog with the configured CTA", async () => {
    await open();
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Fragen? Schreib uns");
  });

  it("applies the configured accent colour", async () => {
    respond(/config\?/, { ...CONFIG, cta: { ...CONFIG.cta, accent: "#ff0000" } });
    await mount();
    const el = await screen.findByRole("button", { name: /Fragen\? Schreib uns/ });
    expect(el.closest(".live-chat-cta")!.getAttribute("style")).toContain("#ff0000");
  });

  it("falls back to the brand accent when none is configured", async () => {
    respond(/config\?/, { ...CONFIG, cta: { ...CONFIG.cta, accent: "" } });
    await mount();
    const el = await screen.findByRole("button", { name: /Fragen\? Schreib uns/ });
    expect(el.closest(".live-chat-cta")!.getAttribute("style")).toContain("#050f68");
  });

  it("shows a tab bar only when more than one tab is enabled", async () => {
    await open();
    expect(screen.getByRole("tablist")).toBeTruthy();
    cleanup();
    respond(/config\?/, { ...CONFIG, tabs: { chat: false, faq: true, docs: false, contact: false } });
    await open();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("LANDS on the first enabled tab, not blindly on chat", async () => {
    // With chat disabled, opening on the chat tab shows an empty body.
    respond(/config\?/, { ...CONFIG, tabs: { chat: false, faq: true, docs: true, contact: false } });
    await open();
    expect(screen.getByText("Was kostet das?")).toBeTruthy();
  });

  it("switches tabs", async () => {
    const u = await open();
    await u.click(screen.getByRole("tab", { name: "FAQ" }));
    expect(screen.getByText("Was kostet das?")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "FAQ" }).getAttribute("aria-selected")).toBe("true");
  });

  it("renders only the tabs the config enables", async () => {
    respond(/config\?/, { ...CONFIG, tabs: { chat: true, faq: false, docs: false, contact: true } });
    await open();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Chat", "Kontakt"]);
  });

  it("speaks English when asked", async () => {
    await open({ lang: "en" });
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Help" })).toBeTruthy();
  });
});

describe("starting a chat", () => {
  const started = () => sent("POST", /^\/live-chat-cta\/chat$/);

  it("refuses to start with an empty message", async () => {
    await open();
    expect((screen.getByRole("button", { name: "Chat starten" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("refuses whitespace only", async () => {
    const u = await open();
    await u.type(screen.getByPlaceholderText("Nachricht …"), "   ");
    expect((screen.getByRole("button", { name: "Chat starten" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("posts the visitor's message with the optional identity", async () => {
    respond(/^\/live-chat-cta\/chat$/, { id: 7, token: "tok" }, 200, "POST");
    const u = await open();
    await u.type(screen.getByPlaceholderText("Name (optional)"), "Erika");
    await u.type(screen.getByPlaceholderText("E-Mail (optional)"), "erika@example.de");
    await u.type(screen.getByPlaceholderText("Nachricht …"), "  Hallo!  ");
    await u.click(screen.getByRole("button", { name: "Chat starten" }));
    await waitFor(() => expect(started()).toHaveLength(1));
    expect(started()[0]!.body).toEqual({
      name: "Erika",
      email: "erika@example.de",
      frontend: "landingpage",
      message: "Hallo!",
    });
  });

  it("PERSISTS the session so a reload keeps the conversation", async () => {
    respond(/^\/live-chat-cta\/chat$/, { id: 7, token: "tok" }, 200, "POST");
    const u = await open();
    await u.type(screen.getByPlaceholderText("Nachricht …"), "Hallo!");
    await u.click(screen.getByRole("button", { name: "Chat starten" }));
    await waitFor(() =>
      expect(localStorage.getItem("tds-live-chat-session:landingpage")).toBe(JSON.stringify({ id: 7, token: "tok" })),
    );
  });

  it("keys the session per frontend", async () => {
    respond(/^\/live-chat-cta\/chat$/, { id: 7, token: "tok" }, 200, "POST");
    const u = await open({ frontend: "blog" });
    await u.type(screen.getByPlaceholderText("Nachricht …"), "Hallo!");
    await u.click(screen.getByRole("button", { name: "Chat starten" }));
    await waitFor(() => expect(localStorage.getItem("tds-live-chat-session:blog")).toBeTruthy());
    expect(localStorage.getItem("tds-live-chat-session:landingpage")).toBeNull();
  });

  it("does NOT start a session when the request fails", async () => {
    respond(/^\/live-chat-cta\/chat$/, { error: "nope" }, 500, "POST");
    const u = await open();
    await u.type(screen.getByPlaceholderText("Nachricht …"), "Hallo!");
    await u.click(screen.getByRole("button", { name: "Chat starten" }));
    await waitFor(() => expect(started()).toHaveLength(1));
    expect(localStorage.getItem("tds-live-chat-session:landingpage")).toBeNull();
    expect(screen.getByRole("button", { name: "Chat starten" })).toBeTruthy();
  });

  it("resumes a stored session instead of asking again", async () => {
    localStorage.setItem("tds-live-chat-session:landingpage", JSON.stringify({ id: 7, token: "tok" }));
    respond(/messages\?since=/, { messages: [] });
    await open();
    expect(await screen.findByPlaceholderText("Nachricht …")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Chat starten" })).toBeNull();
  });

  it("ignores an unreadable stored session", async () => {
    localStorage.setItem("tds-live-chat-session:landingpage", "not json");
    await open();
    expect(screen.getByRole("button", { name: "Chat starten" })).toBeTruthy();
  });
});

describe("an open conversation", () => {
  const MSG = { id: 11, author: "visitor" as const, body: "Hallo!", created_at: "2026-07-20T09:00:00Z" };
  const REPLY = { id: 12, author: "agent" as const, body: "Guten Tag!", created_at: "2026-07-20T09:01:00Z" };

  async function openChat(messages = [MSG, REPLY]) {
    localStorage.setItem("tds-live-chat-session:landingpage", JSON.stringify({ id: 7, token: "tok" }));
    respond(/messages\?since=/, { messages });
    return open();
  }

  it("sends the chat token as a header, never in the URL", async () => {
    // The token authenticates the visitor's session; a URL lands in logs.
    await openChat();
    await waitFor(() => expect(sent("GET", /messages\?since=/)).toHaveLength(1));
    const call = sent("GET", /messages\?since=/)[0]!;
    expect(call.headers["X-Chat-Token"]).toBe("tok");
    expect(call.url).not.toContain("tok");
  });

  it("attributes each message to the right side", async () => {
    await openChat();
    expect(await screen.findByText("Hallo!")).toBeTruthy();
    expect(screen.getByText("Hallo!").className).toContain("live-chat-cta__msg--visitor");
    expect(screen.getByText("Guten Tag!").className).toContain("live-chat-cta__msg--agent");
  });

  it("shows the greeting while the thread is still empty", async () => {
    await openChat([]);
    expect(await screen.findByText("Hallo! Wie können wir helfen?")).toBeTruthy();
  });

  it("posts a reply with the token", async () => {
    respond(/^\/live-chat-cta\/chat\/7\/messages$/, { ok: true }, 200, "POST");
    const u = await openChat();
    await screen.findByText("Hallo!");
    await u.type(screen.getByPlaceholderText("Nachricht …"), "  Noch da?  ");
    await u.click(screen.getByRole("button", { name: "Senden" }));
    await waitFor(() => expect(sent("POST", /chat\/7\/messages$/)).toHaveLength(1));
    const call = sent("POST", /chat\/7\/messages$/)[0]!;
    expect(call.body).toEqual({ body: "Noch da?" });
    expect(call.headers["X-Chat-Token"]).toBe("tok");
  });

  it("clears the box and re-polls after sending", async () => {
    respond(/^\/live-chat-cta\/chat\/7\/messages$/, { ok: true }, 200, "POST");
    const u = await openChat();
    await screen.findByText("Hallo!");
    const before = sent("GET", /messages\?since=/).length;
    await u.type(screen.getByPlaceholderText("Nachricht …"), "Noch da?");
    await u.click(screen.getByRole("button", { name: "Senden" }));
    await waitFor(() => expect((screen.getByPlaceholderText("Nachricht …") as HTMLTextAreaElement).value).toBe(""));
    await waitFor(() => expect(sent("GET", /messages\?since=/).length).toBeGreaterThan(before));
  });

  it("KEEPS the typed message when sending fails", async () => {
    respond(/^\/live-chat-cta\/chat\/7\/messages$/, { error: "nope" }, 500, "POST");
    const u = await openChat();
    await screen.findByText("Hallo!");
    await u.type(screen.getByPlaceholderText("Nachricht …"), "Noch da?");
    await u.click(screen.getByRole("button", { name: "Senden" }));
    await waitFor(() => expect(sent("POST", /chat\/7\/messages$/)).toHaveLength(1));
    expect((screen.getByPlaceholderText("Nachricht …") as HTMLTextAreaElement).value).toBe("Noch da?");
  });

  it("sends on Enter", async () => {
    respond(/^\/live-chat-cta\/chat\/7\/messages$/, { ok: true }, 200, "POST");
    const u = await openChat();
    await screen.findByText("Hallo!");
    await u.type(screen.getByPlaceholderText("Nachricht …"), "Kurz{Enter}");
    await waitFor(() => expect(sent("POST", /chat\/7\/messages$/)).toHaveLength(1));
  });

  it("does NOT send on Shift+Enter — that is a new line", async () => {
    const u = await openChat();
    await screen.findByText("Hallo!");
    const box = screen.getByPlaceholderText("Nachricht …");
    await u.type(box, "Erste Zeile");
    await u.keyboard("{Shift>}{Enter}{/Shift}");
    expect(sent("POST", /chat\/7\/messages$/)).toHaveLength(0);
  });

  it("advances the cursor so a poll never re-fetches old messages", async () => {
    vi.useFakeTimers();
    localStorage.setItem("tds-live-chat-session:landingpage", JSON.stringify({ id: 7, token: "tok" }));
    respond(/messages\?since=/, { messages: [MSG, REPLY] });
    render(<LiveChatCta frontend="landingpage" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole("button", { name: /Fragen\? Schreib uns/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(sent("GET", /since=0/)).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(sent("GET", /since=12/).length).toBeGreaterThan(0);
  });

  it("stops polling when the widget unmounts", async () => {
    vi.useFakeTimers();
    localStorage.setItem("tds-live-chat-session:landingpage", JSON.stringify({ id: 7, token: "tok" }));
    respond(/messages\?since=/, { messages: [] });
    const { unmount } = render(<LiveChatCta frontend="landingpage" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole("button", { name: /Fragen\? Schreib uns/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    const before = sent("GET", /messages\?since=/).length;
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(sent("GET", /messages\?since=/)).toHaveLength(before);
  });
});

describe("the contact form", () => {
  const submitted = () => sent("POST", /contact$/);

  async function openContact() {
    const u = await open();
    await u.click(screen.getByRole("tab", { name: "Kontakt" }));
    return u;
  }

  it("carries a HONEYPOT field that is hidden from people", async () => {
    // It is the only bot defence available in the browser; a bot fills every
    // input it finds, a person never sees this one.
    await openContact();
    const pot = document.querySelector<HTMLInputElement>('input[aria-hidden="true"]')!;
    expect(pot).toBeTruthy();
    expect(pot.tabIndex).toBe(-1);
    expect(pot.getAttribute("autocomplete")).toBe("off");
    expect(pot.style.position).toBe("absolute");
    expect(pot.style.left).toBe("-9999px");
  });

  it("submits the honeypot value so the backend can judge it", async () => {
    await openContact();
    const u = user();
    await u.type(screen.getByPlaceholderText("Name (optional)"), "Erika");
    await u.click(screen.getByRole("button", { name: "Absenden" }));
    await waitFor(() => expect(submitted()).toHaveLength(1));
    expect(submitted()[0]!.body).toHaveProperty("website", "");
  });

  it("sends the whole message with its frontend", async () => {
    await openContact();
    const u = user();
    await u.type(screen.getByPlaceholderText("Name (optional)"), "Erika");
    await u.type(screen.getByPlaceholderText("E-Mail (optional)"), "erika@example.de");
    await u.type(screen.getByPlaceholderText("Betreff (optional)"), "Angebot");
    await u.type(screen.getByPlaceholderText("Deine Nachricht …"), "Wir bräuchten eine Website.");
    await u.click(screen.getByRole("button", { name: "Absenden" }));
    await waitFor(() => expect(submitted()).toHaveLength(1));
    expect(submitted()[0]!.body).toMatchObject({
      name: "Erika",
      email: "erika@example.de",
      subject: "Angebot",
      message: "Wir bräuchten eine Website.",
      frontend: "landingpage",
    });
  });

  it("confirms and replaces the form on success", async () => {
    await openContact();
    const u = user();
    await u.click(screen.getByRole("button", { name: "Absenden" }));
    expect(await screen.findByText("Danke! Wir melden uns.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Absenden" })).toBeNull();
  });

  it("NAMES a rate limit rather than blaming the input", async () => {
    // A 429 means "try later"; showing the validation message would send the
    // visitor round in circles correcting a form that was fine.
    respond(/contact$/, { error: "rate" }, 429, "POST");
    await openContact();
    const u = user();
    await u.click(screen.getByRole("button", { name: "Absenden" }));
    expect(await screen.findByText("Zu viele Anfragen – bitte später erneut versuchen.")).toBeTruthy();
  });

  it("reports a validation failure with the requirements", async () => {
    respond(/contact$/, { error: "invalid" }, 422, "POST");
    await openContact();
    const u = user();
    await u.click(screen.getByRole("button", { name: "Absenden" }));
    expect(await screen.findByText(/min\. 20 Zeichen/)).toBeTruthy();
  });

  it("KEEPS the form on a failure so nothing is retyped", async () => {
    respond(/contact$/, { error: "invalid" }, 422, "POST");
    await openContact();
    const u = user();
    await u.type(screen.getByPlaceholderText("Deine Nachricht …"), "Ein längerer Text.");
    await u.click(screen.getByRole("button", { name: "Absenden" }));
    await screen.findByText(/min\. 20 Zeichen/);
    expect((screen.getByPlaceholderText("Deine Nachricht …") as HTMLTextAreaElement).value).toBe("Ein längerer Text.");
  });

  it("clears a previous error the MOMENT the retry starts", async () => {
    // Asserting only the end state passes without the reset, because the
    // success view replaces the form anyway. What matters is that a stale
    // error is not still on screen while the retry is in flight — that reads
    // as the retry having failed too.
    respond(/contact$/, { error: "invalid" }, 422, "POST");
    await openContact();
    const u = user();
    await u.click(screen.getByRole("button", { name: "Absenden" }));
    await screen.findByText(/min\. 20 Zeichen/);

    respond(/contact$/, { ok: true }, 200, "POST");
    const release = holdRequests(/contact$/);
    await u.click(screen.getByRole("button", { name: "Absenden" }));
    await waitFor(() => expect(submitted()).toHaveLength(2));
    expect(screen.queryByText(/min\. 20 Zeichen/)).toBeNull();
    release();
    expect(await screen.findByText("Danke! Wir melden uns.")).toBeTruthy();
  });
});

describe("FAQ and docs", () => {
  it("expands one FAQ answer at a time", async () => {
    respond(/config\?/, {
      ...CONFIG,
      faqs: [
        { id: 1, category: null, question: "Erste Frage?", answer: "Erste Antwort." },
        { id: 2, category: null, question: "Zweite Frage?", answer: "Zweite Antwort." },
      ],
    });
    const u = await open();
    await u.click(screen.getByRole("tab", { name: "FAQ" }));
    await u.click(screen.getByRole("button", { name: "Erste Frage?" }));
    expect(screen.getByText("Erste Antwort.")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Zweite Frage?" }));
    expect(screen.queryByText("Erste Antwort.")).toBeNull();
    expect(screen.getByText("Zweite Antwort.")).toBeTruthy();
  });

  it("collapses an open FAQ when clicked again", async () => {
    const u = await open();
    await u.click(screen.getByRole("tab", { name: "FAQ" }));
    await u.click(screen.getByRole("button", { name: "Was kostet das?" }));
    expect(screen.getByText("Es kommt darauf an.")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Was kostet das?" }));
    expect(screen.queryByText("Es kommt darauf an.")).toBeNull();
  });

  it("says so when there is no FAQ content", async () => {
    respond(/config\?/, { ...CONFIG, faqs: [] });
    const u = await open();
    await u.click(screen.getByRole("tab", { name: "FAQ" }));
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("opens a doc and navigates back", async () => {
    const u = await open();
    await u.click(screen.getByRole("tab", { name: "Hilfe" }));
    await u.click(screen.getByRole("button", { name: "Erste Schritte" }));
    expect(screen.getByRole("heading", { name: "Erste Schritte" })).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "←" }));
    expect(screen.queryByRole("heading", { name: "Erste Schritte" })).toBeNull();
  });

  it("splits doc text into paragraphs on blank lines", async () => {
    const u = await open();
    await u.click(screen.getByRole("tab", { name: "Hilfe" }));
    await u.click(screen.getByRole("button", { name: "Erste Schritte" }));
    const body = document.querySelector(".live-chat-cta__doc-body")!;
    expect(within(body as HTMLElement).getByText("Absatz eins.")).toBeTruthy();
    expect(within(body as HTMLElement).getByText("Absatz zwei.")).toBeTruthy();
    expect(body.querySelectorAll("p")).toHaveLength(2);
  });

  it("renders admin text as INERT TEXT, never as HTML", async () => {
    // The answers come from the admin panel and land on a public page; React
    // escapes them, and no dangerouslySetInnerHTML is used anywhere here.
    respond(/config\?/, {
      ...CONFIG,
      faqs: [{ id: 1, category: null, question: "XSS?", answer: "<img src=x onerror=alert(1)>" }],
    });
    const u = await open();
    await u.click(screen.getByRole("tab", { name: "FAQ" }));
    await u.click(screen.getByRole("button", { name: "XSS?" }));
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });
});

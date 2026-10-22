import { mayHaveSession } from "../components/accountAuth.js";
import { CONSENT_OPEN_EVENT, readConsent } from "../consent/store.js";
import { apiFetch } from "../api/index.js";

/**
 * `client:when` — hydrate an island only when this visitor needs it (0.60).
 *
 * Every React island on a public page costs the whole React runtime, whether
 * or not it renders anything. Three of the shared ones usually render NOTHING:
 * the account menu for a visitor who never signed in, the consent banner for
 * one who already decided, the chat launcher where chat is switched off. With
 * `client:idle` the blog paid ~200 KB on every article for those three blanks
 * (tds-blog-frontend#27). This directive asks the question first, in plain JS,
 * and loads the island (and React with it) only on a yes:
 *
 *   <AccountMenu client:when="session" lang={lang} />
 *   <ConsentBanner client:when="consent" … />
 *   <LiveChatCta client:when="chat:blog:de" frontend="blog" lang="de" />
 *
 * - `session` — the browser may hold a session (`mayHaveSession()`: the
 *   signed-in cookie or a remembered account hint). The server-rendered markup
 *   stands otherwise, which is exactly the signed-out state: nothing, or the
 *   sign-in link for `loggedOut="login"`.
 * - `consent` — no valid consent record yet, OR the visitor asks to change it
 *   (`openConsentSettings()`). The banner takes that pending request on mount.
 * - `chat:<frontend>[:<lang>]` — the widget's config says it is enabled with at
 *   least one tab, and this visitor has not hidden it. The widget repeats the
 *   config read once it is loaded; only a page with chat on pays for that.
 * - `intent:<selector>` (0.61) — the visitor reaches for a control that needs
 *   the island: a pointer over it, keyboard focus on it, or a press, on any
 *   element matching the selector (the landing page's assistant buttons). The
 *   island also loads the moment it becomes visible, so a dialog opened some
 *   other way (a `#hash` link) never shows an unhydrated form for long.
 *   Hovering is the early signal: by the click the code is usually there.
 *
 * Anything else hydrates like `client:idle`, so a typo costs bytes, not a
 * missing control. Register it with `tdsClientDirectives()` from `./astro`.
 */

type Hydrate = () => Promise<void>;
type Load = () => Promise<Hydrate>;

/** The `client:idle` timing, once the answer is yes. */
function whenIdle(run: () => void): void {
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 200);
}

const CHAT_HIDDEN_KEY = "tds-live-chat-hidden";

/** Mirrors `LiveChatCta`'s own decision to render nothing. */
async function chatWanted(frontend: string, lang: string): Promise<boolean> {
  try {
    if (localStorage.getItem(`${CHAT_HIDDEN_KEY}:${frontend}`) === "1") return false;
  } catch {
    /* storage disabled — the widget would show, so ask the server */
  }
  try {
    const res = await apiFetch(
      `/live-chat-cta/config?frontend=${encodeURIComponent(frontend)}&lang=${encodeURIComponent(lang)}`,
    );
    if (!res.ok) return false;
    const config = (await res.json()) as { enabled?: boolean; tabs?: Record<string, boolean> } | null;
    return Boolean(config?.enabled && Object.values(config.tabs ?? {}).some(Boolean));
  } catch {
    return false;
  }
}

/** Load on the first sign of intent towards `selector`, or once `el` shows. */
function onIntent(selector: string, el: HTMLElement, start: () => void): void {
  const events = ["pointerover", "focusin", "pointerdown"] as const;
  let observer: IntersectionObserver | null = null;
  const fire = () => {
    for (const type of events) document.removeEventListener(type, listener, true);
    observer?.disconnect();
    start();
  };
  const listener = (event: Event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(selector)) fire();
  };
  for (const type of events) document.addEventListener(type, listener, { capture: true, passive: true });
  if ("IntersectionObserver" in window) {
    // `astro-island` is `display: contents`; watch what it renders.
    const watched = Array.from(el.children);
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) fire();
    });
    for (const child of watched) observer.observe(child);
  }
}

export default function clientWhen(load: Load, options: { value: string }, el?: HTMLElement): void {
  const raw = String(options.value ?? "");
  const [condition = "", ...args] = raw.split(":");
  let started = false;
  const start = (now = false) => {
    if (started) return;
    started = true;
    const run = async () => {
      const hydrate = await load();
      await hydrate();
    };
    // An explicit intent does not wait for idle: the visitor is reaching for it.
    if (now) void run();
    else whenIdle(() => void run());
  };

  switch (condition) {
    case "session":
      if (mayHaveSession()) start();
      return;
    case "consent":
      if (readConsent() === null) {
        start();
        return;
      }
      window.addEventListener(CONSENT_OPEN_EVENT, () => start(true), { once: true });
      return;
    case "intent":
      // The selector may itself contain colons (`:not()`), so it is the rest.
      if (el) onIntent(raw.slice(raw.indexOf(":") + 1), el, () => start(true));
      else start();
      return;
    case "chat":
      void chatWanted(args[0] ?? "", args[1] ?? "de").then((wanted) => {
        if (wanted) start();
      });
      return;
    default:
      start();
  }
}


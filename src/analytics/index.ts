/**
 * The public sites' own audience measurement — consent-gated, first-party,
 * no third party anywhere in the chain.
 *
 * What it records, once the visitor has agreed to the `analytics` category:
 *
 *  - page views (path only — never the query string or the hash, which is
 *    where e-mail addresses and reset tokens end up),
 *  - clicks on elements that carry `data-track="name"` and on links that
 *    leave the site (the target host only),
 *  - scroll depth (25/50/75/100 %) and which `section[id]` were reached,
 *  - form progress on `form[data-track-form="name"]`: started, the NAME of
 *    each field entered, submitted. Never a value. Where a visitor gave up
 *    is derived on the server from the last field they entered.
 *  - engaged time, sent whenever the page is hidden.
 *
 * Identity is a random visitor id in localStorage that expires after 30 days
 * and a session id in sessionStorage that ends after 30 idle minutes. Neither
 * exists before consent, and both are deleted the moment consent is
 * withdrawn. The server derives country, device class and browser family
 * from the request and stores neither the IP address nor the user agent.
 *
 * No side effects on import (`sideEffects: ["*.css"]`): a site calls
 * {@link startAnalytics} from its layout.
 */
import { apiBase, runtimeSetting } from "../api/index";
import { consentGranted, onConsentChange } from "../consent/store";

export type AnalyticsSite = "landing" | "blog" | "tools" | "auth" | "shop";

export interface AnalyticsOptions {
  site: AnalyticsSite;
  lang: string;
  /** Override for tests and local stacks; defaults to `{apiBase}/analytics`. */
  endpoint?: string;
}

/** One measured event, as sent on the wire. Short keys: it travels on every page hide. */
export interface AnalyticsEvent {
  /** Type. */
  t:
    | "pageview"
    | "click"
    | "outbound"
    | "scroll"
    | "section"
    | "form_start"
    | "form_field"
    | "form_submit"
    | "exit";
  /** Path the event happened on. */
  p: string;
  /** Key: CTA name, outbound host, section id or form name. */
  k?: string;
  /** Field name (forms only). */
  f?: string;
  /** Number: scroll percentage or engaged milliseconds. */
  n?: number;
}

export interface AnalyticsBatch {
  v: 1;
  site: AnalyticsSite;
  lang: string;
  vid: string;
  sid: string;
  /** The visitor id existed before this session began. */
  ret: boolean;
  /** Present on the first batch of a session only. */
  ref?: string;
  utm?: { source?: string; medium?: string; campaign?: string };
  events: AnalyticsEvent[];
}

export const VISITOR_KEY = "tds-vid";
export const SESSION_KEY = "tds-sid";
export const VISITOR_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
const SCROLL_MILESTONES = [25, 50, 75, 100] as const;
const MAX_QUEUE = 40;

interface StoredVisitor {
  id: string;
  exp: number;
}

interface StoredSession {
  id: string;
  last: number;
  /** Referrer/UTM already sent for this session. */
  sent: boolean;
  ret: boolean;
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* insecure context — fall through */
  }
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

function readJson<T>(store: Storage | undefined, key: string): T | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(store: Storage | undefined, key: string, value: unknown): void {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — this page view is measured, nothing is remembered */
  }
}

function local(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function session(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** The current visitor id, or `null` when there is none (no consent, expired, forgotten). */
export function analyticsVisitorId(): string | null {
  if (typeof window === "undefined") return null;
  const v = readJson<StoredVisitor>(local(), VISITOR_KEY);
  if (!v || typeof v.id !== "string" || typeof v.exp !== "number" || v.exp < Date.now()) return null;
  return v.id;
}

/** Delete both ids from this browser. Withdrawal and "forget me" both end here. */
export function clearAnalyticsIds(): void {
  try {
    local()?.removeItem(VISITOR_KEY);
  } catch {
    /* ignore */
  }
  try {
    session()?.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Visitor id with a FIXED expiry: 30 days from creation, not sliding. A
 * sliding window would let an id live for as long as someone keeps visiting,
 * which is not what the consent text says.
 */
function ensureVisitor(now: number): { id: string; existed: boolean } {
  const existing = analyticsVisitorId();
  if (existing) return { id: existing, existed: true };
  const id = uuid();
  writeJson(local(), VISITOR_KEY, { id, exp: now + VISITOR_TTL_MS } satisfies StoredVisitor);
  return { id, existed: false };
}

function ensureSession(now: number, visitorExisted: boolean): StoredSession {
  const s = readJson<StoredSession>(session(), SESSION_KEY);
  if (s && typeof s.id === "string" && typeof s.last === "number" && now - s.last < SESSION_IDLE_MS) {
    s.last = now;
    writeJson(session(), SESSION_KEY, s);
    return s;
  }
  const fresh: StoredSession = { id: uuid(), last: now, sent: false, ret: visitorExisted };
  writeJson(session(), SESSION_KEY, fresh);
  return fresh;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

function currentPath(): string {
  return clip(window.location.pathname || "/", 200);
}

function referrerHost(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const host = new URL(document.referrer).hostname.toLowerCase();
    return host && host !== window.location.hostname.toLowerCase() ? clip(host, 120) : undefined;
  } catch {
    return undefined;
  }
}

function utm(): AnalyticsBatch["utm"] {
  try {
    const q = new URLSearchParams(window.location.search);
    const out: NonNullable<AnalyticsBatch["utm"]> = {};
    const source = q.get("utm_source");
    const medium = q.get("utm_medium");
    const campaign = q.get("utm_campaign");
    if (source) out.source = clip(source.toLowerCase(), 100);
    if (medium) out.medium = clip(medium.toLowerCase(), 100);
    if (campaign) out.campaign = clip(campaign.toLowerCase(), 100);
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** The browser-level "do not sell or share" signal. Honoured even after consent. */
function globalPrivacyControl(): boolean {
  try {
    return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  } catch {
    return false;
  }
}

async function resolveEndpoint(override?: string): Promise<string> {
  if (override) return override.replace(/\/+$/, "");
  const base = await runtimeSetting("apiBase", apiBase());
  return `${base.replace(/\/+$/, "")}/analytics`;
}

/**
 * Fire and forget. `text/plain` on purpose: it is a CORS-safelisted type, so a
 * cross-origin beacon needs no preflight — and a preflight cannot be answered
 * while the page is unloading.
 */
function send(url: string, body: string): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon(url, body)) return;
    }
  } catch {
    /* fall through to fetch */
  }
  try {
    void fetch(url, {
      method: "POST",
      body,
      keepalive: true,
      mode: "no-cors",
      credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
    }).catch(() => {});
  } catch {
    /* nothing left to try — measurement never breaks a page */
  }
}

/* ------------------------------------------------------------------ */
/* The tracker                                                         */
/* ------------------------------------------------------------------ */

/**
 * Start measuring on this page. Does nothing until the visitor has agreed to
 * `analytics`, starts the moment they do, and stops — deleting both ids — the
 * moment they withdraw. Returns a stop function (tests, hot reload).
 */
export function startAnalytics(options: AnalyticsOptions): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let armed: (() => void) | null = null;

  const evaluate = () => {
    const allowed = consentGranted("analytics") && !globalPrivacyControl();
    if (allowed && !armed) armed = arm(options);
    if (!allowed && armed) {
      armed();
      armed = null;
      clearAnalyticsIds();
    }
  };

  evaluate();
  const offConsent = onConsentChange(evaluate);

  return () => {
    offConsent();
    armed?.();
    armed = null;
  };
}

function arm(options: AnalyticsOptions): () => void {
  const endpointPromise = resolveEndpoint(options.endpoint);
  const queue: AnalyticsEvent[] = [];
  const cleanups: Array<() => void> = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  // Page-scoped state, reset on a bfcache restore.
  let reachedScroll = new Set<number>();
  let reachedSections = new Set<string>();
  let formsStarted = new Set<string>();
  let lastField = new Map<string, string>();
  let visibleSince = document.visibilityState === "visible" ? Date.now() : 0;
  let engaged = 0;

  const listen = <K extends string>(
    target: EventTarget,
    type: K,
    fn: (e: Event) => void,
    opts?: AddEventListenerOptions,
  ) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };

  const push = (event: Omit<AnalyticsEvent, "p"> & { p?: string }) => {
    queue.push({ p: currentPath(), ...event } as AnalyticsEvent);
    if (queue.length >= MAX_QUEUE) flush();
  };

  const flush = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (queue.length === 0) return;
    const now = Date.now();
    const visitor = ensureVisitor(now);
    const sess = ensureSession(now, visitor.existed);
    const batch: AnalyticsBatch = {
      v: 1,
      site: options.site,
      lang: clip(options.lang || "de", 5),
      vid: visitor.id,
      sid: sess.id,
      ret: sess.ret,
      events: queue.splice(0, queue.length),
    };
    if (!sess.sent) {
      const ref = referrerHost();
      const u = utm();
      if (ref) batch.ref = ref;
      if (u) batch.utm = u;
      sess.sent = true;
      writeJson(session(), SESSION_KEY, sess);
    }
    const body = JSON.stringify(batch);
    void endpointPromise.then((base) => send(`${base}/collect`, body));
  };

  const flushSoon = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, 1000);
  };

  /* -- page view -------------------------------------------------- */

  const pageview = () => {
    reachedScroll = new Set();
    reachedSections = new Set();
    formsStarted = new Set();
    lastField = new Map();
    push({ t: "pageview" });
    flushSoon();
    observeSections();
    onScroll();
  };

  /* -- clicks ----------------------------------------------------- */

  listen(
    document,
    "click",
    (e) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;
      const tracked = el.closest<HTMLElement>("[data-track]");
      const name = tracked?.getAttribute("data-track")?.trim();
      if (name) {
        push({ t: "click", k: clip(name, 60) });
        flushSoon();
        return;
      }
      const link = el.closest<HTMLAnchorElement>("a[href]");
      if (!link) return;
      try {
        const url = new URL(link.href, window.location.href);
        if (!/^https?:$/.test(url.protocol)) return;
        if (url.hostname.toLowerCase() === window.location.hostname.toLowerCase()) return;
        push({ t: "outbound", k: clip(url.hostname.toLowerCase(), 120) });
        flushSoon();
      } catch {
        /* unparsable href — not a navigation we can name */
      }
    },
    { capture: true },
  );

  /* -- scroll depth ----------------------------------------------- */

  let scrollFrame = 0;
  const measureScroll = () => {
    scrollFrame = 0;
    const doc = document.documentElement;
    const scrollable = Math.max(doc.scrollHeight - window.innerHeight, 0);
    // A page that fits the viewport was seen in full.
    const pct = scrollable <= 0 ? 100 : Math.round(((window.scrollY || 0) / scrollable) * 100);
    for (const m of SCROLL_MILESTONES) {
      if (pct >= m && !reachedScroll.has(m)) {
        reachedScroll.add(m);
        push({ t: "scroll", n: m });
      }
    }
  };
  const onScroll = () => {
    if (scrollFrame) return;
    scrollFrame =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(measureScroll)
        : (setTimeout(measureScroll, 0) as unknown as number);
  };
  listen(window, "scroll", onScroll, { passive: true });

  /* -- sections --------------------------------------------------- */

  let io: IntersectionObserver | null = null;
  function observeSections() {
    io?.disconnect();
    if (typeof IntersectionObserver !== "function") return;
    // A section counts as reached when its top passes the middle of the
    // viewport — "50 % visible" never happens for a section taller than the
    // screen.
    io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).id;
          if (!id || reachedSections.has(id)) continue;
          reachedSections.add(id);
          push({ t: "section", k: clip(id, 60) });
        }
      },
      { rootMargin: "0px 0px -50% 0px", threshold: 0 },
    );
    document.querySelectorAll<HTMLElement>("section[id]").forEach((s) => io?.observe(s));
  }
  cleanups.push(() => io?.disconnect());

  /* -- forms ------------------------------------------------------ */

  const formName = (el: Element | null): string | null => {
    const form = el?.closest<HTMLFormElement>("form[data-track-form]");
    const name = form?.getAttribute("data-track-form")?.trim();
    return name ? clip(name, 60) : null;
  };

  listen(
    document,
    "focusin",
    (e) => {
      const el = e.target instanceof Element ? e.target : null;
      const form = formName(el);
      if (!form || !el) return;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
        return;
      }
      if (el instanceof HTMLInputElement && ["submit", "button", "hidden", "reset"].includes(el.type)) return;
      // The field's NAME — the attribute a developer wrote. Never its value,
      // never its label text (which can quote what the visitor typed).
      const field = clip(el.name || el.id || el.type || "field", 60);
      if (!formsStarted.has(form)) {
        formsStarted.add(form);
        push({ t: "form_start", k: form });
      }
      if (lastField.get(form) !== field) {
        lastField.set(form, field);
        push({ t: "form_field", k: form, f: field });
      }
    },
    { capture: true },
  );

  listen(
    document,
    "submit",
    (e) => {
      const form = formName(e.target instanceof Element ? e.target : null);
      if (!form) return;
      push({ t: "form_submit", k: form });
      flushSoon();
    },
    { capture: true },
  );

  /* -- visibility, exit, bfcache ---------------------------------- */

  const settleEngaged = () => {
    if (visibleSince) {
      engaged += Date.now() - visibleSince;
      visibleSince = 0;
    }
  };

  const onHidden = () => {
    settleEngaged();
    if (engaged > 0) {
      push({ t: "exit", n: Math.min(engaged, 6 * 60 * 60 * 1000) });
      engaged = 0;
    }
    flush();
  };

  listen(document, "visibilitychange", () => {
    if (document.visibilityState === "hidden") onHidden();
    else visibleSince = Date.now();
  });
  listen(window, "pagehide", onHidden);
  listen(window, "pageshow", (e) => {
    // Restored from the back/forward cache: a real return to the page that
    // ran no script — count it as the view it is.
    if ((e as PageTransitionEvent).persisted) {
      visibleSince = Date.now();
      engaged = 0;
      pageview();
    }
  });

  // A page the browser prerendered on a hunch (speculation rules) runs this
  // script before anyone looks at it. Count it when it is actually shown.
  const doc = document as Document & { prerendering?: boolean };
  if (doc.prerendering) {
    listen(
      document,
      "prerenderingchange",
      () => {
        visibleSince = Date.now();
        pageview();
      },
      { once: true },
    );
  } else {
    pageview();
  }

  return () => {
    if (flushTimer) clearTimeout(flushTimer);
    if (scrollFrame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(scrollFrame);
    queue.length = 0;
    for (const c of cleanups.splice(0)) c();
  };
}

/**
 * "Meine Statistikdaten löschen": ask the server to erase everything recorded
 * under this browser's visitor id, then delete the ids locally. Resolves to
 * `true` when there was nothing to erase or the server confirmed it.
 *
 * Erasing is not withdrawing: while `analytics` stays granted, the next page
 * view starts a new id. The privacy page pairs this with a withdrawal.
 */
export async function forgetAnalytics(endpoint?: string): Promise<boolean> {
  const vid = analyticsVisitorId();
  if (!vid) {
    clearAnalyticsIds();
    return true;
  }
  try {
    const base = await resolveEndpoint(endpoint);
    const res = await fetch(`${base}/forget`, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ visitorId: vid }),
    });
    // Keep the id on failure: it is the only handle a retry has.
    if (res.ok) clearAnalyticsIds();
    return res.ok;
  } catch {
    return false;
  }
}

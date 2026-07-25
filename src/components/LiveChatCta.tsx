import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Language } from "../i18n/translations";

/**
 * Floating bottom-right support widget (the "Live-Chat-CTA"). A launcher bubble
 * with a hide control opens a panel with up to four tabs — live chat, FAQ,
 * documentation and a contact form — each toggleable per frontend.
 *
 * Backed by the `live-chat-cta` extension in tds-core-frontend-api. The widget
 * makes ONE call on mount (`GET /live-chat-cta/config?frontend=…`) which returns
 * whether it is enabled for this frontend, the branding, which tabs are on, and
 * the FAQ/docs content. If disabled (or the call fails) nothing renders — so the
 * bubble is switched on/off per frontend from the admin Einstellungen with no
 * rebuild. Chat is HTTP-polling (no WebSockets on the static host).
 *
 * Styling ships as the `.live-chat-cta*` block in `styles/base.css` (base, not
 * app.css, so the public landingpage/blog get it too).
 */

export interface LiveChatCtaProps {
  /** The frontend key this instance runs on (landingpage/blog/customer/admin/tools). */
  frontend: string;
  /** API origin. "" (default) = same-origin (panel host); public sites pass
   *  "https://api.tracht-digital.de". */
  apiBase?: string;
  /** UI language. Defaults to German. */
  lang?: Language;
}

type TabKey = "chat" | "faq" | "docs" | "contact";

interface Config {
  enabled: boolean;
  cta: { label: string; greeting: string; accent: string };
  tabs: Record<TabKey, boolean>;
  faqs: { id: number; category: string | null; question: string; answer: string }[];
  docs: { id: number; slug: string; title: string; body_markdown: string }[];
}
interface ChatMessage {
  id: number;
  author: "visitor" | "agent";
  body: string;
  created_at: string;
}

const STR = {
  de: {
    close: "Schließen",
    hide: "Ausblenden",
    chat: "Chat",
    faq: "FAQ",
    docs: "Hilfe",
    contact: "Kontakt",
    startPrompt: "Schreib uns – wir antworten so schnell wie möglich.",
    namePh: "Name (optional)",
    emailPh: "E-Mail (optional)",
    msgPh: "Nachricht …",
    send: "Senden",
    start: "Chat starten",
    subjectPh: "Betreff (optional)",
    contactMsgPh: "Deine Nachricht …",
    contactSend: "Absenden",
    contactOk: "Danke! Wir melden uns.",
    contactErr: "Bitte Name, gültige E-Mail und eine Nachricht (min. 20 Zeichen) angeben.",
    rate: "Zu viele Anfragen – bitte später erneut versuchen.",
    empty: "Noch keine Nachrichten.",
  },
  en: {
    close: "Close",
    hide: "Hide",
    chat: "Chat",
    faq: "FAQ",
    docs: "Help",
    contact: "Contact",
    startPrompt: "Message us – we reply as soon as we can.",
    namePh: "Name (optional)",
    emailPh: "Email (optional)",
    msgPh: "Message …",
    send: "Send",
    start: "Start chat",
    subjectPh: "Subject (optional)",
    contactMsgPh: "Your message …",
    contactSend: "Submit",
    contactOk: "Thanks! We'll be in touch.",
    contactErr: "Please provide a name, a valid email and a message (min. 20 chars).",
    rate: "Too many requests – please try again later.",
    empty: "No messages yet.",
  },
} as const;

const HIDDEN_KEY = "tds-live-chat-hidden";
const POLL_MS = 4000;

export default function LiveChatCta({ frontend, apiBase = "", lang = "de" }: LiveChatCtaProps) {
  const t = STR[lang === "en" ? "en" : "de"];
  const [config, setConfig] = useState<Config | null>(null);
  const [hidden, setHidden] = useState(true); // hidden until we know it's enabled
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("chat");

  const api = useCallback(
    (path: string, init?: RequestInit) => fetch(`${apiBase}${path}`, { credentials: "include", ...init }),
    [apiBase],
  );

  useEffect(() => {
    let alive = true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(`${HIDDEN_KEY}:${frontend}`) === "1";
    } catch {
      /* storage disabled */
    }
    api(`/live-chat-cta/config?frontend=${encodeURIComponent(frontend)}&lang=${lang}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Config | null) => {
        if (!alive || !d || !d.enabled) return;
        setConfig(d);
        setHidden(dismissed);
        // Land on the first enabled tab.
        const first = (["chat", "faq", "docs", "contact"] as TabKey[]).find((k) => d.tabs[k]);
        if (first) setTab(first);
      })
      .catch(() => {
        /* backend not reachable — widget stays hidden */
      });
    return () => {
      alive = false;
    };
  }, [api, frontend, lang]);

  const hide = () => {
    setHidden(true);
    setOpen(false);
    try {
      localStorage.setItem(`${HIDDEN_KEY}:${frontend}`, "1");
    } catch {
      /* session-only */
    }
  };

  if (!config || hidden) return null;

  const enabledTabs = (["chat", "faq", "docs", "contact"] as TabKey[]).filter((k) => config.tabs[k]);
  if (enabledTabs.length === 0) return null;

  const accent = config.cta.accent || "#050f68";

  if (!open) {
    return (
      <div className="live-chat-cta live-chat-cta--closed" style={{ "--lc-accent": accent } as CSSProperties}>
        <button type="button" className="live-chat-cta__launcher" onClick={() => setOpen(true)}>
          <span className="live-chat-cta__launcher-icon" aria-hidden="true">💬</span>
          <span className="live-chat-cta__launcher-label">{config.cta.label}</span>
        </button>
        <button type="button" className="live-chat-cta__hide" onClick={hide} aria-label={t.hide} title={t.hide}>
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="live-chat-cta live-chat-cta--open" style={{ "--lc-accent": accent } as CSSProperties} role="dialog" aria-label={config.cta.label}>
      <header className="live-chat-cta__head">
        <span className="live-chat-cta__title">{config.cta.label}</span>
        <button type="button" className="live-chat-cta__close" onClick={() => setOpen(false)} aria-label={t.close} title={t.close}>
          −
        </button>
      </header>

      {enabledTabs.length > 1 ? (
        <nav className="live-chat-cta__tabs" role="tablist">
          {enabledTabs.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-active" : ""} onClick={() => setTab(k)}>
              {t[k]}
            </button>
          ))}
        </nav>
      ) : null}

      <div className="live-chat-cta__body">
        {tab === "chat" && config.tabs.chat ? <ChatPane api={api} frontend={frontend} greeting={config.cta.greeting} t={t} /> : null}
        {tab === "faq" && config.tabs.faq ? <FaqPane faqs={config.faqs} /> : null}
        {tab === "docs" && config.tabs.docs ? <DocsPane docs={config.docs} /> : null}
        {tab === "contact" && config.tabs.contact ? <ContactPane api={api} frontend={frontend} t={t} /> : null}
      </div>
    </div>
  );
}

// === Chat ===================================================================

type Strings = Record<keyof (typeof STR)["de"], string>;

function sessionKey(frontend: string) {
  return `tds-live-chat-session:${frontend}`;
}

function ChatPane({ api, frontend, greeting, t }: { api: (p: string, i?: RequestInit) => Promise<Response>; frontend: string; greeting: string; t: Strings }) {
  const [session, setSession] = useState<{ id: number; token: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const cursor = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(sessionKey(frontend));
      if (raw) setSession(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [frontend]);

  const poll = useCallback(async () => {
    if (!session) return;
    const res = await api(`/live-chat-cta/chat/${session.id}/messages?since=${cursor.current}`, {
      headers: { "X-Chat-Token": session.token },
    });
    if (res.ok) {
      const d = await res.json();
      const incoming: ChatMessage[] = d.messages ?? [];
      if (incoming.length > 0) {
        cursor.current = incoming[incoming.length - 1]!.id;
        setMessages((m) => [...m, ...incoming]);
      }
    }
  }, [api, session]);

  useEffect(() => {
    if (!session) return;
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [session, poll]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const start = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    const res = await api("/live-chat-cta/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, frontend, message: body }),
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      const s = { id: d.id as number, token: d.token as string };
      try {
        localStorage.setItem(sessionKey(frontend), JSON.stringify(s));
      } catch {
        /* ignore */
      }
      setSession(s);
      setDraft("");
    }
  };

  const send = async () => {
    if (!session) return;
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    const res = await api(`/live-chat-cta/chat/${session.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Chat-Token": session.token },
      body: JSON.stringify({ body }),
    });
    setBusy(false);
    if (res.ok) {
      setDraft("");
      await poll();
    }
  };

  if (!session) {
    return (
      <div className="live-chat-cta__chat">
        <p className="live-chat-cta__greeting">{greeting}</p>
        <p className="live-chat-cta__hint">{t.startPrompt}</p>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPh} />
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.msgPh} rows={3} />
        <button type="button" onClick={start} disabled={busy || !draft.trim()}>{t.start}</button>
      </div>
    );
  }

  return (
    <div className="live-chat-cta__chat">
      <div className="live-chat-cta__messages">
        {messages.length === 0 ? <p className="live-chat-cta__hint">{greeting}</p> : null}
        {messages.map((m) => (
          <div key={m.id} className={`live-chat-cta__msg live-chat-cta__msg--${m.author}`}>
            {m.body}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="live-chat-cta__compose">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.msgPh}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" onClick={send} disabled={busy || !draft.trim()}>{t.send}</button>
      </div>
    </div>
  );
}

// === FAQ ====================================================================

function FaqPane({ faqs }: { faqs: Config["faqs"] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (faqs.length === 0) return <p className="live-chat-cta__hint">—</p>;
  return (
    <ul className="live-chat-cta__faq">
      {faqs.map((f) => (
        <li key={f.id}>
          <button type="button" aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)}>
            {f.question}
          </button>
          {open === f.id ? <Prose text={f.answer} className="live-chat-cta__faq-answer" /> : null}
        </li>
      ))}
    </ul>
  );
}

// === Docs ===================================================================

function DocsPane({ docs }: { docs: Config["docs"] }) {
  const [active, setActive] = useState<number | null>(null);
  if (docs.length === 0) return <p className="live-chat-cta__hint">—</p>;
  const current = docs.find((d) => d.id === active) ?? null;
  if (current) {
    return (
      <div className="live-chat-cta__doc">
        <button type="button" className="live-chat-cta__back" onClick={() => setActive(null)}>← </button>
        <h4>{current.title}</h4>
        <Prose text={current.body_markdown} className="live-chat-cta__doc-body" />
      </div>
    );
  }
  return (
    <ul className="live-chat-cta__docs">
      {docs.map((d) => (
        <li key={d.id}>
          <button type="button" onClick={() => setActive(d.id)}>{d.title}</button>
        </li>
      ))}
    </ul>
  );
}

// === Contact ================================================================

function ContactPane({ api, frontend, t }: { api: (p: string, i?: RequestInit) => Promise<Response>; frontend: string; t: Strings }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    setStatus(null);
    const res = await api("/live-chat-cta/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, subject, message, frontend, website }),
    });
    setBusy(false);
    if (res.ok) {
      setDone(true);
    } else if (res.status === 429) {
      setStatus(t.rate);
    } else {
      setStatus(t.contactErr);
    }
  };

  if (done) return <p className="live-chat-cta__ok">{t.contactOk}</p>;

  return (
    <div className="live-chat-cta__contact">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} />
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPh} />
      <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t.subjectPh} />
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t.contactMsgPh} rows={4} />
      {/* Honeypot — hidden from users, filled only by bots. */}
      <input
        type="text"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
      />
      {status ? <p className="live-chat-cta__err">{status}</p> : null}
      <button type="button" onClick={submit} disabled={busy}>{t.contactSend}</button>
    </div>
  );
}

// === helpers ================================================================

/** Render plain text / light markdown safely as paragraphs (React escapes it —
 *  no dangerouslySetInnerHTML, no dependency). Blank lines split paragraphs. */
function Prose({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.split("\n").map((line, j) => (
            <span key={j}>
              {line}
              {j < p.split("\n").length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

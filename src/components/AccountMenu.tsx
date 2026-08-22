import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Avatar from "./Avatar.js";
import {
  accountEndpoints,
  clearAccountHint,
  DEFAULT_LOGIN_URL,
  fetchAccount,
  hasAccountHint,
  invalidateAccount,
  loginHref,
  logoutAccount,
  passwordHref,
  tryRefreshAccount,
  type AccountEndpoints,
} from "./accountAuth.js";
import type { Language } from "../i18n/translations";
import type { Me } from "../types/index.js";

/**
 * Who you are, in a public site's header.
 *
 * The session cookie is `Domain=.tracht-digital.de`, so someone signed in at
 * `auth.tracht-digital.de` is signed in on the blog and the tools site too —
 * and until this existed, both showed them exactly what they show a stranger,
 * with no way back into the portal.
 *
 * It is the public twin of the frontend host's `UserMenu`, and the differences
 * are all consequences of one fact: **a public page is fully usable signed
 * out.**
 *
 * - There is no pre-paint gate here to own "are you logged in", so a signed-out
 *   visitor is a first-class state rather than an impossible one. What they get
 *   is the caller's call ({@link AccountMenuProps.loggedOut}) — the blog shows
 *   nothing, the tools site shows a sign-in link, because on the tools site the
 *   session unlocks something.
 * - Signing out RELOADS instead of redirecting to the login form. The visitor
 *   came to read an article or build a QR code; throwing them at a login they
 *   did not ask for loses their place for no reason.
 * - No company switcher. Acting as a company needs `X-Act-As-Company`, which is
 *   not in auth-api's CORS allow-list — it would fail the preflight, i.e. the
 *   request would never be sent and the control would just look dead.
 */

const STR: Record<Language, Record<string, string>> = {
  de: {
    menuLabel: "Kontomenü",
    portal: "Kundenportal",
    management: "Verwaltung",
    password: "Passwort ändern",
    logout: "Abmelden",
    signIn: "Anmelden",
  },
  en: {
    menuLabel: "Account menu",
    portal: "Customer portal",
    management: "Administration",
    password: "Change password",
    logout: "Sign out",
    signIn: "Sign in",
  },
};

/** Hand-inlined Lucide paths — same reasoning as the host's `Icon.astro`: a
    header must not pull an icon library into a static marketing site. */
const ICON = {
  user: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  grid: (
    <>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </>
  ),
  shield: <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />,
  key: (
    <>
      <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
      <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
};

type IconName = keyof typeof ICON;

function Glyph({ children, size = 16 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export interface AccountMenuLink {
  /** Stable key; also picks the built-in label when `label` is omitted. */
  key: string;
  href: string;
  /** Already-localised text. Omit to use the built-in label for `key`. */
  label?: string;
  icon?: IconName;
  /** Rendered only for a principal with `isAdmin`. */
  adminOnly?: boolean;
}

export interface AccountMenuProps {
  /** UI language. German everywhere by default, as with the other islands. */
  lang?: Language;
  /** Avatar-only trigger — drops the name at every width, not just below `sm`. */
  compact?: boolean;
  /** What a visitor with no session gets. */
  loggedOut?: "nothing" | "login";
  /** What happens after a successful sign-out. */
  afterLogout?: "reload" | "stay";
  /** Build-time fallbacks; `tds-runtime.json` overrides them on a real host. */
  apiBase?: string;
  authApi?: string;
  loginUrl?: string;
  /** Rows above "Passwort ändern". Replaces the defaults when given. */
  links?: AccountMenuLink[];
  className?: string;
}

const DEFAULT_LINKS: AccountMenuLink[] = [
  { key: "portal", href: "https://app.tracht-digital.de", icon: "grid" },
  { key: "management", href: "https://management.tracht-digital.de", icon: "shield", adminOnly: true },
];

export default function AccountMenu({
  lang = "de",
  compact = false,
  loggedOut = "nothing",
  afterLogout = "reload",
  apiBase,
  authApi,
  loginUrl,
  links = DEFAULT_LINKS,
  className,
}: AccountMenuProps) {
  const s = STR[lang] ?? STR.de;

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [endpoints, setEndpoints] = useState<AccountEndpoints | null>(null);
  const [open, setOpen] = useState(false);

  /**
   * Read once, at mount, and never again: the value decides what to paint
   * BEFORE the probe answers, so re-reading it after the probe wrote it would
   * make the "have we ever seen a session" question answer itself.
   */
  const [seenBefore] = useState<boolean>(() => hasAccountHint());

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await accountEndpoints({ apiBase, authApi, loginUrl });
      if (cancelled) return;
      setEndpoints(resolved);

      let principal = await fetchAccount(resolved);

      // The remember-me exchange, but only for a browser that has been signed
      // in before. For everyone else this would be two cross-origin requests
      // that are certain to fail, on every page of a public site.
      if (principal === null && seenBefore) {
        if (await tryRefreshAccount(resolved)) {
          invalidateAccount();
          principal = await fetchAccount(resolved);
        }
      }

      if (cancelled) return;
      if (principal === null) clearAccountHint();
      setMe(principal);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // Endpoint props are read once at mount; they are build constants at every
    // call site and re-resolving them would restart the probe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on an outside click. Escape is handled on the root instead of the
  // document — focus is always inside the panel while it is open, so the event
  // reaches us by bubbling, and the site's mobile-nav already owns a
  // document-level Escape listener that we have no reason to race.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Move focus into the menu when it opens, so the first Tab or Arrow lands on
  // a row rather than walking past the whole panel.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("[data-menu-item]")?.focus();
  }, [open]);

  const onRootKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]") ?? [],
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[(current + step + items.length) % items.length]?.focus();
  }, []);

  const label = useMemo(() => me?.label ?? me?.name ?? me?.email ?? "", [me]);

  const login = endpoints?.login ?? loginUrl ?? DEFAULT_LOGIN_URL;

  const signOut = useCallback(async () => {
    if (endpoints === null) return;
    await logoutAccount(endpoints);
    if (afterLogout === "reload") {
      // A reload, not a local `setMe(null)`: on the tools site `ToolGate` has
      // already revealed a premium tool's body from the session it probed at
      // mount, so leaving the page standing would show an unlocked paid tool
      // to someone who just signed out.
      location.reload();
      return;
    }
    setMe(null);
    setOpen(false);
  }, [endpoints, afterLogout]);

  const signInLink = (
    <a className={`btn btn-ghost${className ? ` ${className}` : ""}`} href={loginHref(login)}>
      {s.signIn}
    </a>
  );

  if (loading) {
    // Two shapes, each one chosen so the settled state has the same width: a
    // browser that has been signed in gets the trigger's geometry, everyone
    // else gets whatever their signed-out state will be anyway. The only
    // visitor who ever sees the header move is one on their first page view
    // after signing in.
    if (seenBefore) {
      return (
        <div className={`tds-dropdown${className ? ` ${className}` : ""}`} aria-hidden="true">
          <button type="button" className="tds-dropdown__trigger" disabled tabIndex={-1}>
            <span className="tds-avatar tds-avatar--sm" />
            <span style={{ color: "var(--color-muted)" }}>
              <Glyph size={14}>{ICON.chevron}</Glyph>
            </span>
          </button>
        </div>
      );
    }
    return loggedOut === "login" ? signInLink : null;
  }

  if (me === null) return loggedOut === "login" ? signInLink : null;

  const rows = links.filter((link) => !link.adminOnly || me.isAdmin);

  return (
    <div
      className={`tds-dropdown${className ? ` ${className}` : ""}`}
      ref={rootRef}
      onKeyDown={onRootKeyDown}
    >
      <button
        type="button"
        ref={triggerRef}
        className="tds-dropdown__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar
          name={label}
          src={me.hasAvatar ? me.avatarUrl : null}
          seed={me.userId}
          size="sm"
          decorative
        />
        {!compact && (
          <span className="min-w-0 hidden sm:block">
            <span className="tds-dropdown__label text-sm font-medium">{label}</span>
          </span>
        )}
        <span aria-hidden="true" style={{ color: "var(--color-muted)" }}>
          <Glyph size={14}>{ICON.chevron}</Glyph>
        </span>
        <span className="sr-only">
          {s.menuLabel}
          {label ? ` — ${label}` : ""}
        </span>
      </button>

      <div
        ref={panelRef}
        className="tds-dropdown__panel"
        role="menu"
        aria-label={s.menuLabel}
        hidden={!open}
      >
        <div className="tds-dropdown__head">
          <Avatar
            name={label}
            src={me.hasAvatar ? me.avatarUrl : null}
            seed={me.userId}
            decorative
          />
          <span className="min-w-0">
            <span className="tds-dropdown__label text-sm font-medium">{label}</span>
            <span className="tds-dropdown__label text-xs" style={{ color: "var(--color-muted)" }}>
              {me.email}
            </span>
          </span>
        </div>

        <hr className="tds-dropdown__sep" />

        {rows.map((link) => (
          <a
            key={link.key}
            className="tds-dropdown__item"
            role="menuitem"
            data-menu-item
            href={link.href}
          >
            <span className="tds-dropdown__icon">
              <Glyph>{ICON[link.icon ?? "user"]}</Glyph>
            </span>
            {link.label ?? s[link.key] ?? link.key}
          </a>
        ))}

        {/* The login UI lives on its own site, so this leaves and comes back
            through ?next=. */}
        <a
          className="tds-dropdown__item"
          role="menuitem"
          data-menu-item
          href={passwordHref(login)}
        >
          <span className="tds-dropdown__icon">
            <Glyph>{ICON.key}</Glyph>
          </span>
          {s.password}
        </a>

        <hr className="tds-dropdown__sep" />

        <button
          type="button"
          className="tds-dropdown__item tds-dropdown__item--danger"
          role="menuitem"
          data-menu-item
          onClick={() => void signOut()}
        >
          <span className="tds-dropdown__icon">
            <Glyph>{ICON.logout}</Glyph>
          </span>
          {s.logout}
        </button>
      </div>
    </div>
  );
}

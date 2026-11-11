/**
 * The consent banner and its settings dialog without React (0.64.8).
 *
 * The React `ConsentBanner` is the one island every first visit of a public
 * page hydrates, and hydrating it costs the visitor the whole React runtime
 * (~210 KB decoded) for a paragraph and three buttons. This is its plain-DOM
 * twin: the SAME markup, classes, copy and behaviour — so the CSS in
 * primitives.css styles both and nothing on screen differs.
 *
 *   <script>
 *     import { mountConsentBanner } from "@tracht-digital-solutions/tds-shared/dom";
 *     mountConsentBanner({ lang: "de", categories: ["analytics"], privacyUrl: "/legal/datenschutz" });
 *   </script>
 *
 * Everything `ConsentBanner` documents holds here too — read its docblock
 * before changing either:
 * - the first layer is a region, not a modal; the second is a native dialog;
 * - "Nur notwendige" and "Alle akzeptieren" carry the same class;
 * - nothing is stored before an answer; an undecided visitor starts all-off;
 * - the banner takes focus only when it asks something;
 * - it publishes its height as `--tds-bottom-lane` while it shows;
 * - the footer link reaches it through `openConsentSettings()`, including a
 *   request made before it was mounted.
 *
 * Mounting waits for an idle moment, as `client:when="consent"` did, so the
 * banner never competes with the page's first paint (it was once the LCP
 * element of the landing page at 4.1 s).
 */

import { translations, type Language } from "../i18n/translations";
import {
  grantShown,
  necessaryOnly,
  restrictToShown,
  type ConsentChoices,
  type OptionalCategory,
} from "../consent/categories";
import { CONSENT_OPEN_EVENT, readConsent, takeConsentOpenRequest, writeConsent } from "../consent/store.js";

export interface MountConsentBannerOptions {
  /** UI language. Defaults to German. */
  lang?: Language;
  /** The optional purposes this site uses, in display order (see `ConsentBanner`). */
  categories?: readonly OptionalCategory[];
  /** Wording of the informational variant (only used when `categories` is empty). */
  variant?: "site" | "panel";
  /** Link target for the privacy policy. */
  privacyUrl?: string;
  /** Optional imprint link, shown in the dialog. */
  imprintUrl?: string;
  /** Where the banner and dialog are appended. Defaults to `document.body`. */
  host?: HTMLElement;
  /** Mount at once instead of at the next idle moment (tests, an explicit request). */
  immediate?: boolean;
}

const DEFAULT_PRIVACY_URL = "https://tracht-digital.de/legal/datenschutz";
/** The longest leg of the dialog's exit transition is 420 ms. */
const EXIT_MS = 450;
const MOUNTED = Symbol.for("tds.consent.banner-mounted");

let uid = 0;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function whenIdle(run: () => void): void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(run, { timeout: 2000 });
  else window.setTimeout(run, 200);
}

/**
 * Mount the banner (when no decision is stored) and the way back into the
 * settings. Returns a cleanup. A second call on the same page is a no-op.
 */
export function mountConsentBanner(options: MountConsentBannerOptions = {}): () => void {
  if (typeof window === "undefined") return () => {};
  const slot = window as unknown as Record<symbol, boolean>;
  if (slot[MOUNTED]) return () => {};
  slot[MOUNTED] = true;

  let cleanup: () => void = () => {};
  let cancelled = false;
  const start = () => {
    if (!cancelled) cleanup = mount(options);
  };
  if (options.immediate) start();
  else whenIdle(start);
  return () => {
    cancelled = true;
    cleanup();
    slot[MOUNTED] = false;
  };
}

function mount({
  lang = "de",
  categories = [],
  variant = "site",
  privacyUrl = DEFAULT_PRIVACY_URL,
  imprintUrl,
  host = document.body,
}: MountConsentBannerOptions): () => void {
  const t = translations[lang].consent;
  const notice = translations[lang].cookieNotice;
  const asks = categories.length > 0;
  const root = document.documentElement;

  let banner: HTMLElement | null = null;
  let stopLane: (() => void) | null = null;
  let dialog: HTMLDialogElement | null = null;
  let exitTimer = 0;

  const save = (choices: ConsentChoices) => {
    writeConsent(restrictToShown(choices, categories), lang);
    closeSettings();
    hideBanner();
  };

  /* ---------------- first layer ---------------- */

  function showBanner() {
    const aside = el("aside", {
      class: "cookie-notice",
      role: "region",
      "aria-label": asks ? t.label : notice.label,
      tabindex: "-1",
    });
    const p = el("p", { class: "cookie-notice-text" });
    p.append(
      `${asks ? t.intro : variant === "panel" ? notice.panelText : notice.siteText} `,
      el("a", { class: "cookie-notice-link", href: privacyUrl }, asks ? t.privacy : notice.privacy),
    );
    aside.append(p);

    const button = (label: string, className: string, onClick: () => void) => {
      const b = el("button", { type: "button", class: className }, label);
      b.addEventListener("click", onClick);
      return b;
    };
    if (asks) {
      const actions = el("div", { class: "cookie-notice-actions" });
      // The two DECISIONS share one class; only "Einstellungen" is quieter.
      actions.append(
        button(t.settings, "cookie-notice-btn cookie-notice-btn--ghost", () => openSettings()),
        button(t.necessaryOnly, "cookie-notice-btn", () => save(necessaryOnly())),
        button(t.acceptAll, "cookie-notice-btn", () => save(grantShown(categories))),
      );
      aside.append(actions);
    } else {
      aside.append(button(notice.accept, "cookie-notice-btn", () => save(necessaryOnly())));
    }

    host.append(aside);
    banner = aside;

    const publish = () => {
      root.style.setProperty("--tds-bottom-lane", `${Math.ceil(aside.getBoundingClientRect().height)}px`);
    };
    publish();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(publish) : null;
    ro?.observe(aside);
    window.addEventListener("resize", publish);
    stopLane = () => {
      ro?.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty("--tds-bottom-lane");
    };

    if (asks) aside.focus();
  }

  function hideBanner() {
    stopLane?.();
    stopLane = null;
    banner?.remove();
    banner = null;
  }

  /* ---------------- second layer ---------------- */

  function buildDialog(initial: ConsentChoices): HTMLDialogElement {
    const n = ++uid;
    const titleId = `tds-consent-title-${n}`;
    const descId = `tds-consent-desc-${n}`;
    const d = el("dialog", {
      class: "tds-modal consent-dialog",
      "aria-labelledby": titleId,
      "aria-describedby": descId,
    });
    d.addEventListener("click", (e) => {
      if (e.target === d) closeSettings();
    });
    // Escape closes WITHOUT saving; leaving is never agreeing.
    d.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeSettings();
    });

    const panel = el("div", { class: "tds-modal__panel consent-dialog__panel" });
    const close = el("button", { type: "button", class: "consent-dialog__close", "aria-label": t.close });
    close.append(el("span", { "aria-hidden": "true" }, "×"));
    close.addEventListener("click", () => closeSettings());
    const title = el("h2", { class: "tds-modal__title", id: titleId, tabindex: "-1" }, t.title);
    const intro = el("p", { class: "consent-dialog__intro", id: descId }, t.intro);

    const list = el("ul", { class: "consent-dialog__list" });
    const inputs = new Map<OptionalCategory, HTMLInputElement>();
    for (const cat of ["necessary" as const, ...categories]) {
      const meta = t.categories[cat];
      const locked = cat === "necessary";
      const li = el("li", { class: "consent-row" });
      const label = el("label", { class: "consent-row__head" });
      const input = el("input", { type: "checkbox", class: "consent-row__input" });
      input.checked = locked ? true : initial[cat];
      input.disabled = locked;
      // React writes the locked row's `checked` as an attribute too; keep the
      // markup identical for any `[checked]` selector.
      if (locked) input.setAttribute("checked", "");
      if (!locked) inputs.set(cat, input);
      label.append(input, el("span", { class: "consent-row__label" }, meta.label));
      if (locked) label.append(el("span", { class: "consent-row__badge" }, t.alwaysOn));
      // Description outside the label, so it is not the checkbox's name.
      li.append(label, el("p", { class: "consent-row__desc" }, meta.description));
      list.append(li);
    }

    const links = el("p", { class: "consent-dialog__links" });
    links.append(el("a", { href: privacyUrl }, t.privacy));
    if (imprintUrl) links.append(" · ", el("a", { href: imprintUrl }, t.imprint));

    const actions = el("div", { class: "consent-dialog__actions" });
    const action = (label: string, className: string, pick: () => ConsentChoices) => {
      const b = el("button", { type: "button", class: className }, label);
      b.addEventListener("click", () => save(pick()));
      return b;
    };
    actions.append(
      action(t.necessaryOnly, "btn btn-ghost", () => necessaryOnly()),
      action(t.acceptAll, "btn btn-ghost", () => grantShown(categories)),
      action(t.save, "btn btn-primary", () => {
        const choices = necessaryOnly();
        for (const [cat, input] of inputs) choices[cat] = input.checked;
        return choices;
      }),
    );

    panel.append(close, title, intro, list, links, actions);
    d.append(panel);
    return d;
  }

  function openSettings() {
    takeConsentOpenRequest();
    window.clearTimeout(exitTimer);
    // Re-seeded on every open: an abandoned edit is never remembered.
    dialog?.remove();
    const d = buildDialog(readConsent()?.choices ?? necessaryOnly());
    host.append(d);
    dialog = d;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    // The heading takes focus: it announces the dialog and arms no button.
    d.querySelector<HTMLElement>(".tds-modal__title")?.focus();
  }

  function closeSettings() {
    const d = dialog;
    if (!d) return;
    dialog = null;
    if (d.open && typeof d.close === "function") d.close();
    else d.removeAttribute("open");
    // Unmount once the exit transition has played.
    exitTimer = window.setTimeout(() => d.remove(), EXIT_MS);
  }

  const onOpen = () => openSettings();
  window.addEventListener(CONSENT_OPEN_EVENT, onOpen);

  if (readConsent() === null) showBanner();
  // A request made before the banner existed (the footer link clicked early).
  if (takeConsentOpenRequest()) openSettings();

  return () => {
    window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
    window.clearTimeout(exitTimer);
    hideBanner();
    dialog?.remove();
    dialog = null;
  };
}

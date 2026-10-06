/**
 * App-shell behaviour for the public sites on a phone — the behaviour half of
 * `styles/app-shell.css`.
 *
 * Consumed via
 * `import { mountAppTabBar, mountSheet } from "@tracht-digital-solutions/tds-shared/app"`
 * from a NON-inline Astro `<script>` (an inline script is not bundled, so a
 * bare import would reach the browser unresolved — same rule as `./nav`).
 *
 * Plain TS, no React: the three sites render their bars as static Astro
 * markup, so what is shared is the mechanics, exactly like `mountMobileNav`.
 */
import { lockBodyScroll, MOBILE_NAV_DESKTOP_QUERY } from "../nav/index.js";
import { applyThemePreference, onThemeChange, readThemePreference } from "../theme/index.js";
import { rememberLocale } from "../prefs/index.js";

/** Below this the app shell (tab bar, sheets) is in charge. */
export const APP_SHELL_QUERY = "(max-width: 63.99rem)";

const LANE = "--tds-tabbar-lane";
const HAS_TABBAR = "tds-has-tabbar";

/**
 * The direction the NEXT page should slide in from, handed across a
 * navigation. `pageDirectionScript` (tds-shared/astro) reads it on the
 * incoming page's `pagereveal` and tags the transition `forward` or `back`.
 * sessionStorage, not a URL parameter: it must not reach the page cache, and it
 * is one hop old at most (the reader clears it, and it expires after 4 s).
 */
export const NAV_DIRECTION_KEY = "tds-nav-dir";

export type SlideDirection = "forward" | "back";

/** Remember which way the next navigation goes (best-effort). */
export function setNavDirection(direction: SlideDirection): void {
  try {
    sessionStorage.setItem(NAV_DIRECTION_KEY, JSON.stringify({ d: direction, t: Date.now() }));
  } catch {
    /* storage disabled — the default direction applies */
  }
}

/**
 * Run `apply` as a horizontal swipe: the new state slides in from the right
 * (`forward`) or from the left (`back`) over the old one, which gives way a
 * little in the same direction. A View Transition of the whole page, animated
 * with transform only, so nothing repaints during it. Without View Transitions
 * or with reduced motion, `apply` simply runs.
 */
export function swipeTransition(apply: () => void, direction: SlideDirection): void {
  const start = (
    document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }
  ).startViewTransition;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!start || reduce) {
    apply();
    return;
  }
  const sign = direction === "forward" ? 1 : -1;
  const transition = start.call(document, apply);
  transition.ready
    .then(() => {
      const root = document.documentElement;
      const timing = { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
      root.animate(
        { transform: [`translateX(${sign * 100}%)`, "translateX(0)"] },
        { ...timing, pseudoElement: "::view-transition-new(root)" },
      );
      root.animate(
        { transform: ["translateX(0)", `translateX(${sign * -30}%)`], opacity: [1, 0.6] },
        { ...timing, pseudoElement: "::view-transition-old(root)" },
      );
    })
    .catch(() => {
      /* transition skipped — the state already applied */
    });
}

/**
 * Mark the current tab, and publish the bar's measured height as
 * `--tds-tabbar-lane` while it is shown.
 *
 * Measured, never a literal: the safe-area inset is part of the bar's height
 * and differs per device. The lane is REMOVED whenever the bar is not on
 * screen (desktop width, destroy) — a stale lane would lift every fixed
 * element on the desktop for no visible reason.
 *
 * Items mark themselves current via `data-tab-match`: a space-separated list
 * of path prefixes (`"/ /page/"`), where a bare `/` only matches exactly.
 */
export function mountAppTabBar(bar: HTMLElement): () => void {
  if (typeof window === "undefined") return () => {};
  const root = document.documentElement;
  const path = location.pathname.replace(/\/+$/, "") || "/";

  for (const item of Array.from(bar.querySelectorAll<HTMLElement>("[data-tab-match]"))) {
    const prefixes = (item.dataset.tabMatch ?? "").split(/\s+/).filter(Boolean);
    const hit = prefixes.some((p) => {
      const clean = p.replace(/\/+$/, "") || "/";
      return clean === "/" || /^\/(en|de)$/.test(clean) ? path === clean : path === clean || path.startsWith(`${clean}/`);
    });
    if (hit) item.setAttribute("aria-current", "page");
  }

  // A tab to the right of the current one slides the next page in from the
  // right, a tab to the left from the left — the bar is a row of places.
  const items = Array.from(bar.querySelectorAll<HTMLElement>(".tds-tabbar__item"));
  const currentIndex = items.findIndex((item) => item.getAttribute("aria-current") === "page");
  const onTabClick = (event: Event) => {
    const item = (event.currentTarget as HTMLElement) ?? null;
    if (!item || item.tagName !== "A") return;
    const index = items.indexOf(item);
    setNavDirection(currentIndex === -1 || index >= currentIndex ? "forward" : "back");
  };
  for (const item of items) item.addEventListener("click", onTabClick);

  const mq = window.matchMedia?.(APP_SHELL_QUERY);
  const publish = () => {
    if (mq && !mq.matches) {
      root.style.removeProperty(LANE);
      root.classList.remove(HAS_TABBAR);
      return;
    }
    root.style.setProperty(LANE, `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    root.classList.add(HAS_TABBAR);
  };
  publish();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(publish) : null;
  ro?.observe(bar);
  mq?.addEventListener?.("change", publish);

  return () => {
    for (const item of items) item.removeEventListener("click", onTabClick);
    ro?.disconnect();
    mq?.removeEventListener?.("change", publish);
    root.style.removeProperty(LANE);
    root.classList.remove(HAS_TABBAR);
  };
}

/** Update a tab's count badge (`.tds-tabbar__badge`). Hidden at 0 by CSS. */
export function setTabBadge(badge: HTMLElement | null, count: number): void {
  if (!badge) return;
  const n = Math.max(0, Math.floor(count));
  badge.dataset.count = String(n);
  badge.textContent = n > 0 ? (n > 99 ? "99+" : String(n)) : "";
}

export interface SheetOptions {
  /** The `<dialog class="tds-sheet">`. */
  dialog: HTMLDialogElement;
  /** Buttons that open it. Get `aria-haspopup="dialog"` + `aria-expanded`. */
  triggers?: HTMLElement[];
  /** Called after it opened (e.g. focus a search field). */
  onOpen?(): void;
}

export interface SheetHandle {
  open(trigger?: HTMLElement): void;
  close(): void;
  destroy(): void;
}

/** Pixels the grab area must travel before a drag starts — below it, a tap stays a click. */
const DRAG_SLOP = 6;
/** Released below this far (or flicked), the sheet closes. */
const DISMISS_DISTANCE = 90;

/**
 * Wire a bottom sheet: open from its triggers, close on the backdrop, on
 * Escape (native for a modal dialog), on any `[data-sheet-close]`, by
 * dragging the grab area down, and when the window grows past the phone
 * breakpoint. Joins the counted scroll lock, and hands focus back to the
 * trigger that opened it.
 *
 * Pointer capture starts only after {@link DRAG_SLOP} pixels: capturing on
 * `pointerdown` swallows the click on the close button inside the grab area.
 */
export function mountSheet(options: SheetOptions): SheetHandle {
  const { dialog, triggers = [], onOpen } = options;
  if (typeof window === "undefined" || typeof dialog.showModal !== "function") {
    return { open() {}, close() {}, destroy() {} };
  }
  let release: (() => void) | null = null;
  let opener: HTMLElement | null = null;
  const off: Array<() => void> = [];
  // `(e: never) => void` accepts any concrete handler (MouseEvent,
  // PointerEvent…) without widening every call site to Event.
  const on = (el: EventTarget, type: string, fn: (e: never) => void) => {
    el.addEventListener(type, fn as EventListener);
    off.push(() => el.removeEventListener(type, fn as EventListener));
  };

  const setExpanded = (value: boolean) => {
    for (const t of triggers) t.setAttribute("aria-expanded", String(value));
  };

  const open = (trigger?: HTMLElement) => {
    if (dialog.open) return;
    opener = trigger ?? (document.activeElement as HTMLElement | null);
    // Swipe in from the side the trigger sits on; a centred trigger keeps the
    // sheet's rise from the bottom.
    const rect = trigger?.getBoundingClientRect();
    if (rect && window.innerWidth > 0) {
      const centre = (rect.left + rect.right) / 2 / window.innerWidth;
      if (centre < 0.42) dialog.dataset.from = "left";
      else if (centre > 0.58) dialog.dataset.from = "right";
      else delete dialog.dataset.from;
    }
    dialog.classList.remove("is-closing");
    dialog.style.transform = "";
    dialog.showModal();
    release = lockBodyScroll();
    setExpanded(true);
    onOpen?.();
  };

  const finish = () => {
    release?.();
    release = null;
    setExpanded(false);
    dialog.classList.remove("is-closing");
    dialog.style.transform = "";
    // preventScroll: the page under a sheet must not jump to the trigger.
    opener?.focus?.({ preventScroll: true });
    opener = null;
  };

  const close = () => {
    if (!dialog.open) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      dialog.close();
      return;
    }
    dialog.classList.add("is-closing");
    window.setTimeout(() => dialog.close(), 170);
  };

  for (const t of triggers) {
    t.setAttribute("aria-haspopup", "dialog");
    t.setAttribute("aria-expanded", "false");
    on(t, "click", (e: MouseEvent) => {
      e.preventDefault();
      open(t);
    });
  }
  // `close` fires for Escape, form[method=dialog] and our own close().
  on(dialog, "close", finish);
  // A click on the ::backdrop arrives with the dialog itself as target.
  on(dialog, "click", (e: MouseEvent) => {
    if (e.target === dialog) close();
    else if ((e.target as HTMLElement).closest?.("[data-sheet-close]")) close();
  });
  // Links inside navigate normally; just get out of the way.
  on(dialog, "click", (e: MouseEvent) => {
    const link = (e.target as HTMLElement).closest?.("a[href]");
    if (link && !link.hasAttribute("data-sheet-keep")) close();
  });

  // Drag to dismiss, from the grab area only (the body scrolls).
  const grab = dialog.querySelector<HTMLElement>(".tds-sheet__grab");
  if (grab) {
    let startY = 0;
    let startT = 0;
    let dy = 0;
    let dragging = false;
    let pointerId: number | null = null;
    on(grab, "pointerdown", (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointerId = e.pointerId;
      startY = e.clientY;
      startT = e.timeStamp;
      dy = 0;
      dragging = false;
    });
    on(grab, "pointermove", (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      dy = Math.max(0, e.clientY - startY);
      if (!dragging && dy > DRAG_SLOP) {
        dragging = true;
        dialog.classList.add("is-dragging");
        try {
          grab.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
      }
      if (dragging) dialog.style.transform = `translateY(${dy}px)`;
    });
    const end = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      if (!dragging) return;
      dragging = false;
      dialog.classList.remove("is-dragging");
      const velocity = dy / Math.max(1, e.timeStamp - startT);
      if (dy > DISMISS_DISTANCE || velocity > 0.6) close();
      else dialog.style.transform = "";
    };
    on(grab, "pointerup", end);
    on(grab, "pointercancel", end);
  }

  const mq = window.matchMedia?.(MOBILE_NAV_DESKTOP_QUERY);
  if (mq) {
    on(mq, "change", () => {
      if (mq.matches && dialog.open) dialog.close();
    });
  }

  return {
    open,
    close,
    destroy() {
      for (const f of off.splice(0)) f();
      if (dialog.open) dialog.close();
      release?.();
    },
  };
}

/**
 * Tuck a sticky header away while the reader scrolls DOWN and bring it back on
 * the first scroll up — the way native reading apps free the screen. Only on
 * phones, never before the header has scrolled past its own height, and never
 * while something inside it holds focus.
 */
export function mountAppHeader(header: HTMLElement): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia?.(APP_SHELL_QUERY);
  let last = window.scrollY;
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = window.scrollY;
    const delta = y - last;
    last = y;
    if (mq && !mq.matches) {
      header.classList.remove("is-tucked");
      return;
    }
    if (header.contains(document.activeElement)) return;
    if (y < header.offsetHeight + 16 || delta < -6) header.classList.remove("is-tucked");
    else if (delta > 6) header.classList.add("is-tucked");
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    window.removeEventListener("scroll", onScroll);
    header.classList.remove("is-tucked");
  };
}

/**
 * Register the site's service worker (`/sw.js`, built with `tds-shared/pwa`).
 *
 * Only on HTTPS or localhost, only after `load` so it never competes with the
 * page's own requests. Failures are silent: the site works without it.
 */
export function registerServiceWorker(url = "/sw.js"): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const secure = location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (!secure) return;
  const go = () => {
    navigator.serviceWorker.register(url, { scope: "/" }).catch(() => {
      /* blocked or unavailable — the site simply stays online-only */
    });
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}

/**
 * Wire the settings sheet's shared controls inside `container`:
 *
 * - `[data-theme-choice="light|dark|system"]` buttons — apply through
 *   `applyThemePreference` (the one theme write path, which also writes the
 *   cross-site cookie) and keep `aria-pressed` in sync, also when the theme is
 *   changed elsewhere (the header toggle, another tab via the account sync).
 * - `a[data-locale-link="de|en"]` links — remember the language before the
 *   browser follows the link.
 *
 * Site-specific rows (text size, focus mode…) stay with the site.
 */
export function mountPreferenceControls(container: HTMLElement): () => void {
  if (typeof window === "undefined") return () => {};
  const themeButtons = Array.from(container.querySelectorAll<HTMLButtonElement>("[data-theme-choice]"));
  const sync = () => {
    const current = readThemePreference();
    for (const b of themeButtons) b.setAttribute("aria-pressed", String(b.dataset.themeChoice === current));
  };
  const onTheme = (e: Event) => {
    const button = e.currentTarget as HTMLElement;
    const choice = button.dataset.themeChoice;
    if (choice !== "light" && choice !== "dark" && choice !== "system") return;
    if (choice === readThemePreference()) return;
    // The new theme swipes in from the side of the option that was tapped
    // relative to the one that was on: a choice to the right comes in from
    // the right.
    const from = themeButtons.findIndex((b) => b.dataset.themeChoice === readThemePreference());
    const to = themeButtons.indexOf(button as HTMLButtonElement);
    swipeTransition(() => {
      applyThemePreference(choice);
      sync();
    }, from === -1 || to >= from ? "forward" : "back");
  };
  for (const b of themeButtons) b.addEventListener("click", onTheme);
  const unTheme = onThemeChange(sync);
  sync();

  const localeLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>("a[data-locale-link]"));
  const onLocale = (e: Event) => {
    const value = (e.currentTarget as HTMLElement).dataset.localeLink;
    if (value === "de" || value === "en") {
      rememberLocale(value);
      // DE → EN slides forward, EN → DE back: the switch reads left to right.
      setNavDirection(value === "en" ? "forward" : "back");
    }
  };
  for (const a of localeLinks) a.addEventListener("click", onLocale);

  return () => {
    for (const b of themeButtons) b.removeEventListener("click", onTheme);
    for (const a of localeLinks) a.removeEventListener("click", onLocale);
    unTheme();
  };
}

export { mountTabPages, mountLiveFilter } from "./tabPages.js";
export type { TabPagesHandle, LiveFilterOptions } from "./tabPages.js";

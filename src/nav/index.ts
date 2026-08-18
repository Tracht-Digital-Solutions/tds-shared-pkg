/**
 * Mobile navigation mechanics — the behaviour half of the mobile menu.
 *
 * Consumed via
 * `import { mountMobileNav } from "@tracht-digital-solutions/tds-shared/nav"`,
 * paired with the `.tds-mobile-menu` / `.tds-menu-toggle` / `.tds-menu-bar*`
 * primitives in `styles/primitives.css`.
 *
 * ### Why plain TS and not a React island
 *
 * The three public headers are `.astro` markup over three different link
 * sources — the landingpage builds section anchors, the blog joins a hardcoded
 * array with build-time taxonomy, the tools site reads `lib/site.ts`. There is
 * no shared *markup* to extract, only shared *mechanics*, and a React island
 * would drag the runtime into three sites that mount their headers as static
 * HTML. So this is a plain module an Astro `<script>` imports, exactly like
 * `toast` and `theme`.
 *
 * Note for the consumer: the `<script>` calling this must NOT be `is:inline`.
 * An inline script is not bundled, so its `import` would reach the browser as
 * a bare specifier.
 *
 * ### What it standardises
 *
 * Before this module the workspace held four mobile menus with four different
 * scroll-lock and focus strategies, and one public site with no mobile menu at
 * all. The contract here is the union of the best of them:
 *
 * - `aria-expanded` on the toggle, `data-open` + `aria-hidden` on the panel —
 *   the exact attributes `.tds-menu-bar*` (hamburger↔×) and `.tds-mobile-menu`
 *   already key off, so the CSS needs no class coordination.
 * - A **counted** body scroll lock (see {@link lockBodyScroll}).
 * - Escape closes and hands focus back to the toggle.
 * - An outside click closes — without yanking focus to the toggle, because the
 *   user just pointed somewhere else on purpose.
 * - A click on a `[data-menu-link]` closes without `preventDefault`: these are
 *   multi-page apps, so the browser navigates normally and the close only
 *   matters for the bfcache restore.
 * - Crossing into the desktop breakpoint force-closes, so the panel can never
 *   linger invisibly after a rotate or resize.
 * - Focus moves into the panel on open and the Tab cycle is trapped between the
 *   toggle and the panel's contents. The toggle is deliberately part of that
 *   cycle: it is the control that closes the menu again, and it sits before the
 *   panel in the DOM, so Shift+Tab reaching it is what a reader expects.
 *
 * ### The panel host is deliberately NOT a consumer
 *
 * `tds-core-frontend-pkg` keeps its own off-canvas drawer: a dashboard shell
 * with ~30 entries across 6 colour-coded zones is not a dropdown case. That is
 * a documented exception, not an oversight — see the repo AGENTS.md.
 */

/** Tailwind's `lg`, i.e. 1024px. The breakpoint every public header hides its desktop nav at. */
export const MOBILE_NAV_DESKTOP_QUERY = "(min-width: 64rem)";

/**
 * Elements that can hold focus. Deliberately NOT filtered by visibility:
 * `offsetParent` and `getClientRects()` are both meaningless under jsdom, so a
 * visibility filter would make every test here vacuous. The panel is
 * `visibility: hidden` while closed, which already removes its contents from
 * the tab order in a real browser, and this list is only ever queried while the
 * panel is open.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Lock page scrolling, returning the release function.
 *
 * ### Why this is counted
 *
 * Three repos used to write `document.body.style.overflow` directly. With two
 * overlays open at once — a mobile menu and a `ConfirmDialog`, say — whichever
 * closed FIRST restored the empty string and unlocked the page behind the other
 * one. The symptom is a background that scrolls under an open modal, which
 * reads as a CSS bug and is nowhere near the cause.
 *
 * So the lock is a counter on `<body>` and the original inline `overflow` is
 * remembered on the first acquire and restored only on the last release. The
 * returned function is idempotent — calling it twice does not decrement twice.
 *
 * Exported so any future overlay joins the same counter instead of inventing a
 * fifth scroll lock.
 */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  const body = document.body;
  const held = Number(body.dataset.tdsScrollLock ?? "0") || 0;

  if (held === 0) {
    // The inline value only, not the computed one: restoring a computed
    // `visible` would override a stylesheet that wanted something else.
    body.dataset.tdsScrollLockPrev = body.style.overflow;
    body.style.overflow = "hidden";
  }
  body.dataset.tdsScrollLock = String(held + 1);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (Number(body.dataset.tdsScrollLock ?? "1") || 1) - 1;
    if (remaining > 0) {
      body.dataset.tdsScrollLock = String(remaining);
      return;
    }
    const previous = body.dataset.tdsScrollLockPrev ?? "";
    delete body.dataset.tdsScrollLock;
    delete body.dataset.tdsScrollLockPrev;
    body.style.overflow = previous;
  };
}

export interface MobileNavOptions {
  /** The hamburger button. Carries `aria-controls` + `aria-expanded` in the markup. */
  toggle: HTMLElement;
  /** The panel it controls, normally `.tds-mobile-menu`. */
  panel: HTMLElement;
  /** Media query at which the desktop nav takes over. Default {@link MOBILE_NAV_DESKTOP_QUERY}. */
  desktopQuery?: string;
  /** Links inside the panel that close it when clicked. Default `[data-menu-link]`. */
  linkSelector?: string;
  /** Close when the pointer lands outside panel and toggle. Default `true`. */
  closeOnOutsideClick?: boolean;
  /** Keep Tab inside toggle + panel while open. Default `true`. */
  trapFocus?: boolean;
  /** Notified after every state change — for a consumer that also drives an overlay or icon. */
  onOpenChange?(open: boolean): void;
}

export interface MobileNavHandle {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  /** Detach every listener and release the scroll lock. */
  destroy(): void;
}

const NOOP_HANDLE: MobileNavHandle = {
  open() {},
  close() {},
  toggle() {},
  isOpen: () => false,
  destroy() {},
};

/**
 * Wire a hamburger button to a mobile menu panel.
 *
 * Idempotent on the markup: the initial closed state is written to the DOM on
 * mount, so a header whose attributes drift cannot ship a panel that CSS thinks
 * is open.
 */
export function mountMobileNav(options: MobileNavOptions): MobileNavHandle {
  const {
    toggle: trigger,
    panel,
    desktopQuery = MOBILE_NAV_DESKTOP_QUERY,
    linkSelector = "[data-menu-link]",
    closeOnOutsideClick = true,
    trapFocus = true,
    onOpenChange,
  } = options;

  if (typeof document === "undefined" || !trigger || !panel) return NOOP_HANDLE;

  let isOpen = false;
  let release: (() => void) | null = null;
  const teardown: Array<() => void> = [];

  const on = (
    target: Document | HTMLElement,
    type: string,
    handler: EventListener,
  ) => {
    target.addEventListener(type, handler);
    teardown.push(() => target.removeEventListener(type, handler));
  };

  /** Toggle first, then the panel's own controls — DOM order, and it keeps the closer reachable. */
  const cycle = (): HTMLElement[] => [
    trigger,
    ...Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)),
  ];

  /**
   * Only take focus back when it is still ours to take. If the reader has
   * already moved on — clicked a field elsewhere, tabbed into the page — pulling
   * them back to the hamburger is a jump they did not ask for.
   */
  const focusIsOurs = () => {
    const active = document.activeElement;
    return !active || active === document.body || panel.contains(active);
  };

  const setOpen = (next: boolean, restoreFocus = true) => {
    if (next === isOpen) return;
    isOpen = next;

    trigger.setAttribute("aria-expanded", next ? "true" : "false");
    panel.dataset.open = next ? "true" : "false";
    panel.setAttribute("aria-hidden", next ? "false" : "true");

    if (next) {
      release = lockBodyScroll();
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      if (first) {
        first.focus();
      } else {
        panel.tabIndex = -1;
        panel.focus();
      }
    } else {
      release?.();
      release = null;
      if (restoreFocus && focusIsOurs()) trigger.focus();
    }

    onOpenChange?.(next);
  };

  // Initial state, written rather than assumed: a header whose attributes drift
  // must not be able to ship a panel the CSS already considers open.
  trigger.setAttribute("aria-expanded", "false");
  panel.dataset.open = "false";
  panel.setAttribute("aria-hidden", "true");

  on(trigger, "click", () => setOpen(!isOpen));

  // Delegated, so a panel whose links are rendered later still closes.
  on(panel, "click", (event) => {
    const target = (event as MouseEvent).target;
    if (!(target instanceof Element)) return;
    if (target.closest(linkSelector)) setOpen(false);
  });

  on(document, "keydown", (event) => {
    if (!isOpen) return; // never steal Escape or Tab from an unrelated dialog
    const e = event as KeyboardEvent;

    if (e.key === "Escape") {
      setOpen(false);
      return;
    }

    if (e.key !== "Tab" || !trapFocus) return;
    const items = cycle();
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement as HTMLElement | null;

    if (!active || !items.includes(active)) {
      e.preventDefault();
      first.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    }
  });

  if (closeOnOutsideClick) {
    on(document, "click", (event) => {
      if (!isOpen) return;
      const target = (event as MouseEvent).target;
      if (!(target instanceof Node)) return;
      if (panel.contains(target) || trigger.contains(target)) return;
      // No focus restore: the reader deliberately pointed somewhere else.
      setOpen(false, false);
    });
  }

  const mq = typeof window !== "undefined" ? window.matchMedia?.(desktopQuery) : undefined;
  if (mq) {
    const onChange = (event: Event) => {
      if ((event as MediaQueryListEvent).matches) setOpen(false, false);
    };
    // `addEventListener` on MediaQueryList is the modern form; every browser
    // this stack targets has it (the `addListener` fallback is Safari <14).
    mq.addEventListener("change", onChange);
    teardown.push(() => mq.removeEventListener("change", onChange));
  }

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!isOpen),
    isOpen: () => isOpen,
    destroy() {
      // Close FIRST, then detach. Tearing down while open would leave the
      // panel visible with nothing left listening to close it — and the
      // scroll lock held by a handle nobody has a reference to any more.
      setOpen(false, false);
      for (const off of teardown.splice(0)) off();
    },
  };
}

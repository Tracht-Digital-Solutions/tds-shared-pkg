/**
 * Tab pages — the bottom tab bar's destinations as full-screen app pages.
 *
 * Since 0.49 (2026-10-06) a tab that is not a plain link opens a PAGE, not a
 * bottom sheet: full screen above the content, the tab bar staying visible
 * beneath it, the way a native app switches tabs. Pages slide in from the side
 * their tab sits on relative to the tab that was active (right of it → from
 * the right), a horizontal swipe on a page moves to the neighbouring tab, and
 * the browser's back button closes the page (one history entry per opening,
 * replaced — not stacked — while switching between pages).
 *
 * Markup contract:
 *
 *   <nav class="tds-tabbar">
 *     <a class="tds-tabbar__item" href="/" data-tab-match="/">…</a>
 *     <button class="tds-tabbar__item" data-tab-page="discover">…</button>
 *   </nav>
 *   <section class="tds-tabpage" id="tabpage-discover" data-tab-page-id="discover"
 *            aria-labelledby="…" hidden>
 *     <header class="tds-tabpage__head"><h2 tabindex="-1">…</h2></header>
 *     <div class="tds-tabpage__body">… [data-autofocus] …</div>
 *   </section>
 *
 * The page is NOT a modal `<dialog>`: a modal makes everything else inert,
 * the tab bar included, and the bar is how a reader moves on. Instead the rest
 * of the document (everything but the bar and the pages) is made `inert` while
 * a page is open, which is the same for assistive tech and keeps the bar live.
 */
import { lockBodyScroll } from "../nav/index.js";
import { setNavDirection } from "./index.js";

const DESKTOP = "(min-width: 64rem)";
const SWIPE_MIN = 64;
const STATE_KEY = "tdsTab";

export interface TabPagesHandle {
  open(id: string): void;
  close(): void;
  current(): string | null;
  destroy(): void;
}

export function mountTabPages(bar: HTMLElement): TabPagesHandle {
  const noop: TabPagesHandle = { open() {}, close() {}, current: () => null, destroy() {} };
  if (typeof window === "undefined") return noop;

  const items = Array.from(bar.querySelectorAll<HTMLElement>(".tds-tabbar__item"));
  const pages = new Map<string, HTMLElement>();
  for (const page of Array.from(document.querySelectorAll<HTMLElement>(".tds-tabpage[data-tab-page-id]"))) {
    pages.set(page.dataset.tabPageId!, page);
  }
  if (pages.size === 0) return noop;

  /** The tab of the page underneath — the link tab marked current, else the first. */
  const homeIndex = Math.max(0, items.findIndex((i) => i.getAttribute("aria-current") === "page"));
  const indexOf = (id: string | null) =>
    id === null ? homeIndex : items.findIndex((i) => i.dataset.tabPage === id);

  let active: string | null = null;
  let release: (() => void) | null = null;
  let pushed = false;
  let opener: HTMLElement | null = null;
  const inerted: HTMLElement[] = [];
  const reduce = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const setInert = (on: boolean) => {
    if (on) {
      for (const child of Array.from(document.body.children) as HTMLElement[]) {
        if (child === bar || child.contains(bar) || child.classList.contains("tds-tabpage")) continue;
        if (child.tagName === "SCRIPT" || child.hasAttribute("inert")) continue;
        child.setAttribute("inert", "");
        inerted.push(child);
      }
    } else {
      for (const el of inerted.splice(0)) el.removeAttribute("inert");
    }
  };

  const markTabs = () => {
    for (const item of items) {
      const id = item.dataset.tabPage;
      if (id) {
        item.setAttribute("aria-expanded", String(id === active));
        item.classList.toggle("is-active", id === active);
      }
    }
    // While a page is open the link tab of the page underneath is not "where
    // you are" any more — show the open page's tab as the selected one.
    bar.classList.toggle("has-open-page", active !== null);
  };

  const slide = (el: HTMLElement, from: number, to: number, fadeOut = false): Promise<void> => {
    if (reduce() || typeof el.animate !== "function") return Promise.resolve();
    const anim = el.animate(
      [
        { transform: `translateX(${from}%)`, opacity: fadeOut ? 1 : from === 0 ? 1 : 1 },
        { transform: `translateX(${to}%)`, opacity: fadeOut ? 0.4 : 1 },
      ],
      { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    return anim.finished.then(() => undefined).catch(() => undefined);
  };

  const focusPage = (page: HTMLElement) => {
    const target =
      page.querySelector<HTMLElement>("[data-autofocus]") ??
      page.querySelector<HTMLElement>(".tds-tabpage__head [tabindex='-1'], .tds-tabpage__head h2");
    target?.focus({ preventScroll: true });
  };

  const show = (id: string, viaHistory = false) => {
    const page = pages.get(id);
    if (!page || window.matchMedia?.(DESKTOP).matches) return;
    if (active === id) return;
    const from = active;
    const dir = indexOf(id) >= indexOf(from) ? 1 : -1;
    const previous = from ? pages.get(from) : null;

    if (from === null) {
      opener = document.activeElement as HTMLElement | null;
      release = lockBodyScroll();
      setInert(true);
      if (!viaHistory) {
        history.pushState({ ...(history.state ?? {}), [STATE_KEY]: id }, "");
        pushed = true;
      }
    } else if (!viaHistory) {
      history.replaceState({ ...(history.state ?? {}), [STATE_KEY]: id }, "");
    }

    active = id;
    page.hidden = false;
    page.scrollTop = 0;
    markTabs();
    void slide(page, dir * 100, 0);
    if (previous) {
      void slide(previous, 0, dir * -30, true).then(() => {
        if (active !== from) previous.hidden = true;
      });
    }
    page.dispatchEvent(new CustomEvent("tds:tabpage-open", { bubbles: true }));
    focusPage(page);
  };

  /**
   * Close the open page back to the content.
   * `viaHistory`: Back was pressed (the entry is already gone).
   * `keepEntry`: a jump link was followed — rewrite the page's history entry
   * in place instead of going back, because a Back would restore the old
   * scroll position and undo the jump.
   */
  const hide = (viaHistory = false, keepEntry = false) => {
    if (active === null) return;
    const page = pages.get(active)!;
    const dir = homeIndex >= indexOf(active) ? 1 : -1;
    active = null;
    markTabs();
    setInert(false);
    release?.();
    release = null;
    void slide(page, 0, dir * -100).then(() => {
      if (active === null) page.hidden = true;
    });
    if (!viaHistory && pushed && !keepEntry) {
      pushed = false;
      history.back();
    } else {
      if (keepEntry && pushed) {
        const state = { ...((history.state as Record<string, unknown> | null) ?? {}) };
        delete state[STATE_KEY];
        history.replaceState(state, "");
      }
      pushed = false;
    }
    if (!keepEntry) opener?.focus?.({ preventScroll: true });
    opener = null;
  };

  // Tab taps.
  const onItem = (event: Event) => {
    const item = event.currentTarget as HTMLElement;
    const id = item.dataset.tabPage;
    if (id) {
      event.preventDefault();
      if (active === id) hide();
      else show(id);
      return;
    }
    // A link tab: its own page underneath just closes the overlay; any other
    // link navigates (and the next page slides in from the right side).
    if (active !== null && item.getAttribute("aria-current") === "page") {
      event.preventDefault();
      hide();
    } else if (active !== null) {
      setNavDirection(items.indexOf(item) >= indexOf(active) ? "forward" : "back");
    }
  };
  for (const item of items) item.addEventListener("click", onItem);

  // Escape closes; the browser's Back closes (or reopens on Forward).
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && active !== null) hide();
  };
  const onPop = (event: PopStateEvent) => {
    const id = (event.state as Record<string, unknown> | null)?.[STATE_KEY];
    if (typeof id === "string" && pages.has(id)) show(id, true);
    else hide(true);
  };
  document.addEventListener("keydown", onKey);
  window.addEventListener("popstate", onPop);

  // A link inside a page navigates; get the overlay out of the way first so
  // the bfcache restores the content, not an open page.
  const onPageClick = (event: Event) => {
    const link = (event.target as HTMLElement).closest?.("a[href]");
    if (!link || link.hasAttribute("data-keep-page")) return;
    const href = link.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      // An in-page jump (a chapter): close, then scroll there ourselves.
      event.preventDefault();
      const target = document.getElementById(decodeURIComponent(href.slice(1)));
      hide(false, true);
      requestAnimationFrame(() => {
        target?.scrollIntoView({ block: "start", behavior: reduce() ? "auto" : "smooth" });
        if (target) history.replaceState(history.state, "", href);
      });
      return;
    }
    active = null;
    markTabs();
    setInert(false);
    release?.();
    release = null;
    pushed = false;
  };

  // Horizontal swipe on a page → the neighbouring tab.
  const swipeOff: Array<() => void> = [];
  for (const page of pages.values()) {
    page.addEventListener("click", onPageClick);
    let x0 = 0;
    let y0 = 0;
    let tracking = false;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      tracking = true;
      x0 = e.clientX;
      y0 = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      const here = indexOf(active);
      const next = items[here + (dx < 0 ? 1 : -1)];
      if (!next) return;
      if (next.dataset.tabPage) show(next.dataset.tabPage);
      else if (next.getAttribute("aria-current") === "page") hide();
      else if (next instanceof HTMLAnchorElement && next.href) {
        // A link tab (the basket): go there, sliding the way the swipe went.
        setNavDirection(dx < 0 ? "forward" : "back");
        location.assign(next.href);
      }
    };
    page.addEventListener("pointerdown", down);
    page.addEventListener("pointerup", up);
    page.addEventListener("pointercancel", () => (tracking = false));
    swipeOff.push(() => {
      page.removeEventListener("pointerdown", down);
      page.removeEventListener("pointerup", up);
      page.removeEventListener("click", onPageClick);
    });
  }

  // Growing past the phone breakpoint closes any page.
  const mq = window.matchMedia?.(DESKTOP);
  const onMq = () => {
    if (mq?.matches) hide();
  };
  mq?.addEventListener?.("change", onMq);

  // Reopen after a reload or a Forward that lands on a page entry.
  const initial = (history.state as Record<string, unknown> | null)?.[STATE_KEY];
  if (typeof initial === "string" && pages.has(initial)) {
    pushed = true;
    show(initial, true);
  }

  return {
    open: (id) => show(id),
    close: () => hide(),
    current: () => active,
    destroy() {
      for (const item of items) item.removeEventListener("click", onItem);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      mq?.removeEventListener?.("change", onMq);
      for (const f of swipeOff) f();
      hide(true);
    },
  };
}

export interface LiveFilterOptions {
  /** The search field. */
  input: HTMLInputElement;
  /** Items to filter; each carries `data-search` (lower-case text). */
  items: HTMLElement[];
  /** Shown only while the field is empty (the presentation: categories…). */
  idle?: HTMLElement | null;
  /** Shown only while there is a query (the result list). */
  results?: HTMLElement | null;
  /** Shown when a query matches nothing. */
  empty?: HTMLElement | null;
  /** Optional live region that announces the hit count. */
  status?: HTMLElement | null;
  /** "{n} Treffer" — the announcement text. */
  countLabel?: (n: number) => string;
}

/**
 * The search-and-presentation pattern of a "Discover" page: while the field is
 * empty the page PRESENTS (categories, topics); as soon as something is typed
 * it SEARCHES — every word must match an item's `data-search`. Diacritics are
 * folded so "kuche" finds "Küche". Returns a function that re-applies the
 * current query (e.g. after the page reopens).
 */
export function mountLiveFilter(o: LiveFilterOptions): () => void {
  const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const texts = o.items.map((item) => fold(item.dataset.search ?? item.textContent ?? ""));
  const apply = () => {
    const words = fold(o.input.value).split(/\s+/).filter(Boolean);
    const searching = words.length > 0;
    if (o.idle) o.idle.hidden = searching;
    if (o.results) o.results.hidden = !searching;
    let shown = 0;
    o.items.forEach((item, i) => {
      const hit = searching && words.every((w) => texts[i]!.includes(w));
      item.style.display = hit ? "" : "none";
      if (hit) shown++;
    });
    if (o.empty) o.empty.hidden = !searching || shown > 0;
    if (o.status) o.status.textContent = searching && o.countLabel ? o.countLabel(shown) : "";
  };
  o.input.addEventListener("input", apply);
  apply();
  return apply;
}

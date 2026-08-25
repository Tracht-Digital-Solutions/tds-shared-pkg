// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  lockBodyScroll,
  mountMobileNav,
  mountNavProgress,
  MOBILE_NAV_DESKTOP_QUERY,
  NAV_PROGRESS_ID,
} from "../nav";

/**
 * Mobile navigation mechanics.
 *
 * Every assertion here stands for a behaviour one of the four hand-rolled
 * implementations had and the others did not — this module exists to stop that
 * set from diverging a fifth time.
 */

/**
 * jsdom ships no matchMedia. A controllable stub is not a convenience here:
 * "close the panel when the viewport crosses into desktop" is exactly the kind
 * of rule that is never exercised by hand, because it needs a resize.
 */
type Listener = (event: MediaQueryListEvent) => void;
let mqListeners: Listener[] = [];
let mqMatches = false;

function installMatchMedia() {
  mqListeners = [];
  mqMatches = false;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    media: query,
    get matches() {
      return mqMatches;
    },
    addEventListener: (_: string, fn: Listener) => mqListeners.push(fn),
    removeEventListener: (_: string, fn: Listener) => {
      mqListeners = mqListeners.filter((l) => l !== fn);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
}

function crossIntoDesktop() {
  mqMatches = true;
  for (const fn of [...mqListeners]) fn({ matches: true } as MediaQueryListEvent);
}

function build() {
  document.body.innerHTML = `
    <button id="toggle" aria-controls="panel" aria-expanded="false">Menu</button>
    <div id="panel">
      <a id="first" href="#a" data-menu-link>A</a>
      <a id="last" href="#b" data-menu-link>B</a>
    </div>
    <a id="outside" href="#c">Elsewhere</a>
  `;
  return {
    toggle: document.getElementById("toggle") as HTMLButtonElement,
    panel: document.getElementById("panel") as HTMLElement,
    first: document.getElementById("first") as HTMLAnchorElement,
    last: document.getElementById("last") as HTMLAnchorElement,
    outside: document.getElementById("outside") as HTMLAnchorElement,
  };
}

const press = (key: string, shiftKey = false) =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));

beforeEach(() => {
  installMatchMedia();
  document.body.style.overflow = "";
  delete document.body.dataset.tdsScrollLock;
  delete document.body.dataset.tdsScrollLockPrev;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("lockBodyScroll", () => {
  it("locks and restores", () => {
    const release = lockBodyScroll();
    expect(document.body.style.overflow).toBe("hidden");
    release();
    expect(document.body.style.overflow).toBe("");
  });

  it("counts, so the first overlay to close does not unlock the page behind the second", () => {
    // The bug this pins: three repos wrote `body.style.overflow` directly, so a
    // mobile menu and a ConfirmDialog open together left the page scrolling
    // under whichever stayed open.
    const a = lockBodyScroll();
    const b = lockBodyScroll();
    a();
    expect(document.body.style.overflow).toBe("hidden");
    b();
    expect(document.body.style.overflow).toBe("");
  });

  it("is idempotent — a double release cannot decrement twice", () => {
    const a = lockBodyScroll();
    const b = lockBodyScroll();
    a();
    a();
    expect(document.body.style.overflow).toBe("hidden");
    b();
    expect(document.body.style.overflow).toBe("");
  });

  it("restores the page's own inline overflow rather than clearing it", () => {
    document.body.style.overflow = "clip";
    const release = lockBodyScroll();
    release();
    expect(document.body.style.overflow).toBe("clip");
  });
});

describe("mountMobileNav", () => {
  it("writes the closed state on mount instead of trusting the markup", () => {
    const { toggle, panel } = build();
    panel.dataset.open = "true"; // drifted markup
    mountMobileNav({ toggle, panel });
    expect(panel.dataset.open).toBe("false");
    expect(panel.getAttribute("aria-hidden")).toBe("true");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles the attributes the hamburger and panel CSS key off", () => {
    const { toggle, panel } = build();
    mountMobileNav({ toggle, panel });

    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.dataset.open).toBe("true");
    expect(panel.getAttribute("aria-hidden")).toBe("false");

    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.dataset.open).toBe("false");
    expect(panel.getAttribute("aria-hidden")).toBe("true");
  });

  it("locks page scroll while open", () => {
    const { toggle, panel } = build();
    mountMobileNav({ toggle, panel });
    toggle.click();
    expect(document.body.style.overflow).toBe("hidden");
    toggle.click();
    expect(document.body.style.overflow).toBe("");
  });

  it("moves focus into the panel on open", () => {
    const { toggle, panel, first } = build();
    mountMobileNav({ toggle, panel });
    toggle.click();
    expect(document.activeElement).toBe(first);
  });

  it("closes on Escape and hands focus back to the toggle", () => {
    const { toggle, panel } = build();
    mountMobileNav({ toggle, panel });
    toggle.click();
    press("Escape");
    expect(panel.dataset.open).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("ignores Escape while closed, so it cannot steal it from a dialog", () => {
    const { toggle, panel } = build();
    const onOpenChange = vi.fn();
    mountMobileNav({ toggle, panel, onOpenChange });
    press("Escape");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes when a menu link is clicked, without preventing navigation", () => {
    const { toggle, panel, first } = build();
    mountMobileNav({ toggle, panel });
    toggle.click();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    first.dispatchEvent(event);
    expect(panel.dataset.open).toBe("false");
    expect(event.defaultPrevented).toBe(false);
  });

  it("closes on an outside click but leaves focus where the reader put it", () => {
    const { toggle, panel, outside } = build();
    mountMobileNav({ toggle, panel });
    toggle.click();
    outside.focus();
    outside.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(panel.dataset.open).toBe("false");
    expect(document.activeElement).toBe(outside);
  });

  it("does not treat the toggle's own click as an outside click", () => {
    const { toggle, panel } = build();
    mountMobileNav({ toggle, panel });
    toggle.click();
    expect(panel.dataset.open).toBe("true");
  });

  it("force-closes when the viewport crosses into the desktop nav", () => {
    const { toggle, panel } = build();
    mountMobileNav({ toggle, panel });
    toggle.click();
    crossIntoDesktop();
    expect(panel.dataset.open).toBe("false");
    expect(document.body.style.overflow).toBe("");
  });

  it("defaults to the lg breakpoint the public headers hide their nav at", () => {
    const { toggle, panel } = build();
    mountMobileNav({ toggle, panel });
    expect(window.matchMedia).toHaveBeenCalledWith(MOBILE_NAV_DESKTOP_QUERY);
  });

  it("wraps Tab from the last panel item back to the toggle", () => {
    // The toggle is part of the cycle on purpose: it is the control that
    // closes the panel, and it precedes the panel in the DOM.
    const { toggle, panel, last } = build();
    mountMobileNav({ toggle, panel });
    toggle.click();
    last.focus();
    press("Tab");
    expect(document.activeElement).toBe(toggle);
  });

  it("wraps Shift+Tab from the toggle to the last panel item", () => {
    const { toggle, panel, last } = build();
    mountMobileNav({ toggle, panel });
    toggle.click();
    toggle.focus();
    press("Tab", true);
    expect(document.activeElement).toBe(last);
  });

  it("pulls escaped focus back into the cycle", () => {
    const { toggle, panel, outside } = build();
    mountMobileNav({ toggle, panel });
    toggle.click();
    outside.focus();
    press("Tab");
    expect(document.activeElement).toBe(toggle);
  });

  it("leaves Tab alone when the trap is switched off", () => {
    const { toggle, panel, last } = build();
    mountMobileNav({ toggle, panel, trapFocus: false });
    toggle.click();
    last.focus();
    press("Tab");
    expect(document.activeElement).toBe(last);
  });

  it("releases the lock and detaches on destroy", () => {
    const { toggle, panel } = build();
    const handle = mountMobileNav({ toggle, panel });
    handle.open();
    expect(document.body.style.overflow).toBe("hidden");

    handle.destroy();
    expect(document.body.style.overflow).toBe("");

    toggle.click();
    expect(panel.dataset.open).toBe("false");
  });

  it("reports state through onOpenChange exactly once per transition", () => {
    const { toggle, panel } = build();
    const onOpenChange = vi.fn();
    const handle = mountMobileNav({ toggle, panel, onOpenChange });
    handle.open();
    handle.open();
    handle.close();
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });
});

describe("mountNavProgress", () => {
  afterEach(() => {
    document.getElementById("tds-nav-progress")?.remove();
  });

  it("mounts one decorative bar and nothing more", () => {
    const teardown = mountNavProgress();
    const bar = document.getElementById(NAV_PROGRESS_ID);
    expect(bar).not.toBeNull();
    expect(bar?.className).toBe("tds-nav-progress");
    // The swapped region already announces itself with aria-busy; a second
    // announcement for the same event is noise.
    expect(bar?.getAttribute("aria-hidden")).toBe("true");
    expect(bar?.dataset.state).toBe("idle");
    teardown();
    expect(document.getElementById(NAV_PROGRESS_ID)).toBeNull();
  });

  it("is idempotent — the shell re-runs its scripts on every page load", () => {
    const teardown = mountNavProgress();
    mountNavProgress();
    expect(document.querySelectorAll(".tds-nav-progress")).toHaveLength(1);
    teardown();
  });

  it("binds the server-rendered persisted bar instead of treating it as already wired", () => {
    document.body.innerHTML = `<div id="${NAV_PROGRESS_ID}" class="tds-nav-progress" data-state="idle"></div>`;
    const teardown = mountNavProgress();
    const bar = document.getElementById(NAV_PROGRESS_ID);

    document.dispatchEvent(new Event("astro:before-preparation"));
    expect(bar?.dataset.state).toBe("loading");
    teardown();
  });

  it("runs on navigation and winds down on arrival", () => {
    const teardown = mountNavProgress();
    const bar = document.getElementById(NAV_PROGRESS_ID);

    document.dispatchEvent(new Event("astro:before-preparation"));
    expect(bar?.dataset.state).toBe("loading");

    document.dispatchEvent(new Event("astro:page-load"));
    expect(bar?.dataset.state).toBe("done");
    teardown();
  });

  it("ignores the page-load of the INITIAL page view", () => {
    // That event fires on a cold load too, and without the guard the bar
    // would flash its done-state across the top of every first paint.
    const teardown = mountNavProgress();
    const bar = document.getElementById(NAV_PROGRESS_ID);
    document.dispatchEvent(new Event("astro:page-load"));
    expect(bar?.dataset.state).toBe("idle");
    teardown();
  });

  it("resets invisibly after completion so the next run grows forwards", () => {
    const teardown = mountNavProgress();
    const bar = document.getElementById(NAV_PROGRESS_ID);
    document.dispatchEvent(new Event("astro:before-preparation"));
    document.dispatchEvent(new Event("astro:page-load"));
    expect(bar?.dataset.state).toBe("done");

    bar?.dispatchEvent(new TransitionEvent("transitionend", { propertyName: "opacity" }));
    expect(bar?.dataset.state).toBe("idle");

    document.dispatchEvent(new Event("astro:before-preparation"));
    expect(bar?.dataset.state).toBe("loading");
    teardown();
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountLiveFilter, mountTabPages } from "../app";

/**
 * Tab pages replace the bottom sheets (0.49): the bar stays usable, the rest
 * of the page is inert while a page is open, Back closes it, and switching
 * between pages does not stack history entries.
 */
function setup() {
  document.body.innerHTML = `
    <main id="content"><a href="#x">content link</a></main>
    <nav class="tds-tabbar">
      <a class="tds-tabbar__item" href="/" aria-current="page">Start</a>
      <button class="tds-tabbar__item" data-tab-page="discover">Entdecken</button>
      <button class="tds-tabbar__item" data-tab-page="more">Mehr</button>
    </nav>
    <section class="tds-tabpage" data-tab-page-id="discover" hidden>
      <header class="tds-tabpage__head"><h2 tabindex="-1">Entdecken</h2></header>
      <div class="tds-tabpage__body"><input data-autofocus /></div>
    </section>
    <section class="tds-tabpage" data-tab-page-id="more" hidden>
      <header class="tds-tabpage__head"><h2 tabindex="-1">Mehr</h2></header>
    </section>`;
  return document.querySelector<HTMLElement>(".tds-tabbar")!;
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} }) as never;
  history.replaceState(null, "");
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("mountTabPages", () => {
  it("opens a page from its tab, keeps the bar live and the content inert", () => {
    const bar = setup();
    const handle = mountTabPages(bar);
    bar.querySelector<HTMLButtonElement>('[data-tab-page="discover"]')!.click();
    const page = document.querySelector<HTMLElement>('[data-tab-page-id="discover"]')!;
    expect(page.hidden).toBe(false);
    expect(document.getElementById("content")!.hasAttribute("inert")).toBe(true);
    expect(bar.hasAttribute("inert")).toBe(false);
    expect(bar.querySelector('[data-tab-page="discover"]')!.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(page.querySelector("[data-autofocus]"));
    expect(history.state).toEqual({ tdsTab: "discover" });
    handle.destroy();
  });

  it("switches pages by replacing the history entry, not stacking one", () => {
    const bar = setup();
    const handle = mountTabPages(bar);
    const length = history.length;
    bar.querySelector<HTMLButtonElement>('[data-tab-page="discover"]')!.click();
    bar.querySelector<HTMLButtonElement>('[data-tab-page="more"]')!.click();
    expect(history.length).toBe(length + 1);
    expect(history.state).toEqual({ tdsTab: "more" });
    expect(handle.current()).toBe("more");
    handle.destroy();
  });

  it("closes on Escape and on the current link tab, and releases the content", () => {
    const bar = setup();
    const handle = mountTabPages(bar);
    bar.querySelector<HTMLButtonElement>('[data-tab-page="more"]')!.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handle.current()).toBeNull();
    expect(document.getElementById("content")!.hasAttribute("inert")).toBe(false);

    bar.querySelector<HTMLButtonElement>('[data-tab-page="more"]')!.click();
    const start = bar.querySelector<HTMLAnchorElement>('a[aria-current="page"]')!;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    start.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(handle.current()).toBeNull();
    handle.destroy();
  });

  it("closes when the browser goes Back", () => {
    const bar = setup();
    const handle = mountTabPages(bar);
    bar.querySelector<HTMLButtonElement>('[data-tab-page="discover"]')!.click();
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    expect(handle.current()).toBeNull();
    handle.destroy();
  });
});

describe("mountLiveFilter", () => {
  it("presents while empty, searches while typing, folds diacritics", () => {
    document.body.innerHTML = `
      <input id="q" />
      <div id="idle">Kategorien</div>
      <div id="results"><a data-search="küchenplaner">A</a><a data-search="rechnung">B</a></div>
      <p id="empty" hidden>Nichts</p>`;
    const input = document.getElementById("q") as HTMLInputElement;
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-search]"));
    mountLiveFilter({
      input,
      items,
      idle: document.getElementById("idle"),
      results: document.getElementById("results"),
      empty: document.getElementById("empty"),
    });
    expect(document.getElementById("idle")!.hidden).toBe(false);
    expect(document.getElementById("results")!.hidden).toBe(true);
    input.value = "kuche";
    input.dispatchEvent(new Event("input"));
    expect(items.map((i) => i.style.display)).toEqual(["", "none"]);
    expect(document.getElementById("idle")!.hidden).toBe(true);
    input.value = "zzz";
    input.dispatchEvent(new Event("input"));
    expect(document.getElementById("empty")!.hidden).toBe(false);
  });
});
